'use strict';
/* global process: readonly, module: readonly, Promise: readonly */

/**
 * @typedef {Object} CpuStat
 * @property {int} n - initial int the argument was generated from
 * @property {number} elapsed - total wall clock time spent
 * @property {number} ops - operations per second ( === elapsed / n )
 * @property {number} [user] - CPU time spent in userspace (node.js only)
 * @property {number} [system] - CPU time spent in kernel space (node.js only)
 * @property {number} [cpu] - combined CPU time ( === user + system )
 * @property {string} [err] - if present, indicates that the output was not as expected
 * All times are in seconds, with available precision.
 * All times exclude setup, teardown, and surrounding code.
 */

// alas, process.cpuUsage is not available in browser, so don't rely on it.
const process = require('process/');
const cpuTime = typeof process === 'object' && typeof process.cpuUsage === 'function'
  ? () => process.cpuUsage()
  : () => {return {}};

/**
 * @desc Asynchronous parametric benchmarking library.
 *
 * A snippet of code is executed with different parameter values,
 * where parameter affects (or at least is expected to) the execution time.
 *
 * Before each execution input data is formed by a setup() hook.
 * The default one just forwards the n parameter.
 * After each execution the result may be tested to actually be correct,
 * as well as deinitialization performed, via teardown() hook.
 *
 * So instead of endlessly repeating the same code over and over again,
 * we try to plot execution time vs the parameter and hopefully find
 * interesting occasions such as cache pollution or the intersection between
 * a fast but naive implementation and a slower but asymptotically better approach.
 *
 * cpu time (user + system) is measured as well as physical (aka wall clock) time.
 *
 * @example
 *  const bench = new BigoBench().setup(myFunction).teardown(otherFunction);
 *  bench.run((arg, cb) => { for (let i = 0; i &lt; arg; i++) doStuff(); cb() })
 *    .then(console.log);
 */
class ParaBench {
  constructor () {
    this._setup = (n, cb) => cb(n);
    this._teardown = (_, cb) => cb();
  }

  /**
   * @desc Create initial argument for function under test from a positive integer n.
   * Must be returned via callback.
   * @returns {ParaBench}
   * @param {(n: number, cb: (input: any) => void) => void} fun Converts n into arbitrary type and calls a callback on it
   * @example bench.setup( (n, cb) => cb( new Array(n).fill(0) ) );
   */
  setup (fun) {
    this._setup = fun;
    return this;
  }

  /**
   * Deallocate whatever resources were used for the benchmark, and also
   * test the result for validity.
   * @param {(retVal: any, callback: ([string]) => void) => void} fun
   * @returns {ParaBench} self
   */
  teardown (fun) {
    this._teardown = fun;
    return this;
  }

  /**
   * @desc Execute benchmark.
   * @param {int} n - positive integer parameter to generate input from.
   * @param {(input: any, callback: (retVal: any) => void) => void} userCode (arg, callback) => {...; callback(retVal)}
   * @returns {Promise<CpuStat>}
   */
  probe (n, userCode) {
    return new Promise( resolve => {
      this._setup(n, resolve)
    }).then( arg => new Promise( resolve => {
      const date1 = new Date();
      const cpu1 = cpuTime();

      userCode(arg, retVal => {
        const cpu2 = cpuTime();
        const date2 = new Date();
        this._teardown(retVal, err => resolve({ err, date1, date2, cpu1, cpu2 }));
      })
    })).then( hash => new Promise( resolve => {
      const { cpu1, cpu2, date1, date2, err } = hash;
      const elapsed = (date2 - date1) / 1000;

      const ret = { n, elapsed, iter: elapsed / n };
      if (err)
        ret.err = err;
      if (cpu2.user !== undefined) {
        ret.user = (cpu2.user - cpu1.user) / 10 ** 6;
        ret.system = (cpu2.system - cpu1.system) / 10 ** 6;
        ret.cpu = ret.user + ret.system;
      }

      resolve(ret);
    }));
  }

  /**
   * @desc Compare different solutions of the same problem, returning
   * a hash with solution runtime data (through a promise).
   * @param {object} options
   * @param {array<int>} [options.argList] argument to compare at
   * @param {int} [options.minArg]
   * @param {int} [options.maxArg]
   * @param {number} [options.maxTime]
   * @param {int} [options.repeat]
   * @param {Object<string, (input: any, callback: (any) => void) => void>} variants name => function, name2 => function2 ...
   * @returns {Promise<Object<string, Array<CpuStat>>>}
   * @example bench.compare( {minArg: 1, maxArg: 10**6, maxTime: 1] }, { qSort, bubbleSort, mergeSort } )
   *              .then( data => { for (let name in data) { plotRuntime( data[name] )}} );
   */
  compare (options = {}, variants = {}) {
    const minArg  = options.minArg ?? 1;
    const maxArg  = options.maxArg ?? Infinity;
    const maxTime = options.maxTime;
    const repeat  = options.repeat ?? 1;

    if (maxArg === Infinity && !maxTime && !options.argList)
      throw new Error('One of maxArg, maxTime, of argList must be specified');

    const probes = options.argList ?? (function* () {
      for (let i = minArg; i <= maxArg; i = Math.ceil(i * 4 / 3))
        yield i;
    })();

    const gen = (function* () {
      for (const n of probes) {
        if (Object.keys(variants).length === 0)
          return;
        for (const name in variants) {
          for (let i = 0; i < repeat; i++)
            yield { name, n };
        }
      }
    })();

    const out = {};
    const timeSpent = {};
    for (const key in variants) {
      out[key] = [];
      timeSpent[key] = 0;
    }

    const iterate = resolve => {
      const next = gen.next().value;
      if (!next)
        return resolve(out);

      const { name, n } = next;
      return this.probe(n, variants[name]).then(piece => {
        const cpu = timeSpent[name] += piece.elapsed;
        if (cpu > maxTime)
          delete variants[name]; // had enough
        out[name].push(piece);
        iterate(resolve);
      });
    }

    return new Promise(iterate);
  }


  /**
   * @static
   * @desc Process raw comparison data into something useful for e.g. plotting
   * @param {Object<string, Array<CpuStat>>} comparison Results of a previous compare() call.
   * @param {Object} options
   * @returns {Object<n : Array<int>, times : Object<string,Array<int>> >} data
   */
  flattenData(comparison, options = {}) {
    const threshold = 0.004; // TODO use options
    const validArgs = new Set();
    const intermadiate = {};
    const out = { n: [], times:{} };
    for (let name in comparison) {
      intermadiate[name] = new Map();
      out.times[name] = [];
      for (let entry of comparison[name]) {
        if (entry.elapsed >= threshold)
          validArgs.add(entry.n);
        intermadiate[name].set(entry.n, entry.elapsed);
      }
    }

    for (let n of [...validArgs].sort((x,y) => x-y)) {
      out.n.push(n);
      for (let name in comparison)
        out.times[name].push( intermadiate[name].get(n) );
    }

    return out;
  }
}


module.exports = { ParaBench };
