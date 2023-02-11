'use strict';
/* global process: readonly, module: readonly, Promise: readonly */

/**
 * @typedef {Object} CpuStat
 * @property {int} n - initial int the argument was generated from
 * @property {number} time - total wall clock time spent
 * @property {number} ops - operations per second ( === time / n )
 * @property {number} [user] - CPU time spent in userspace (node.js only)
 * @property {number} [system] - CPU time spent in kernel space (node.js only)
 * @property {number} [cpu] - combined CPU time ( === user + system )
 * @property {string} [err] - if present, indicates that the output was not as expected
 * All times are in seconds, with available precision.
 * All times exclude setup, teardown, and surrounding code.
 */

const { timedPromise, getTime } = require( './util' );

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
    this._timeout = 2;
  }

  timeout(seconds) {
    this._timeout = seconds;
    return this;
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
   * @param {Object} options
   * @param {int} options.arg - positive integer parameter to generate input from.
   * @param {number} [options.timeout] - when to declare the probe is taking too long
   * @param {(input: any, callback: (retVal: any) => void) => void} userCode (arg, callback) => {...; callback(retVal)}
   * @returns {Promise<CpuStat>}
   */
  probe (options, userCode) {
    const n = options.arg;
    if (!(Number.isInteger(n) && n > 0))
      throw new Error("probe requires positive integer {arg} parameter");

    return timedPromise( options.timeout, resolve => {
      this._setup(n, resolve);
    }).then( arg => timedPromise( options.timeout, resolve => {

      /* begin critical section */
      const date1 = getTime();
      const cpu1 = cpuTime();
      userCode(arg, retVal => {
        const cpu2 = cpuTime();
        const date2 = getTime();
        /* end critical section */

        this._teardown(retVal, err => resolve({ err, date1, date2, cpu1, cpu2 }));
      });
    })).then( hash => new Promise( resolve => {
      const { cpu1, cpu2, date1, date2, err } = hash;
      const time = (date2 - date1) / 1000;

      const ret = { n, time, iter: time / n };
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

    const pending = new Set( Object.keys(variants) );

    const gen = (function* () {
      for (const n of probes) {
        // if all variants have been exhausted (e.g. due to time limit),
        // stop here and don't continue with the rest of probes
        if (pending.size === 0)
          return;
        for (const name in variants) {
          if (!pending.has(name))
            continue;
          for (let i = 0; i < repeat; i++) {
            yield {name, n};
          }
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
      return this.probe({arg: n}, variants[name]).then(piece => {
        const cpu = timeSpent[name] += piece.time;
        if (cpu > maxTime)
          pending.delete(name); // had enough
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
   * @param {number} options.minTime - resolution (in second). Default is 0.004.
   * @returns {Object<n : Array<int>, times : Object<string,Array<int>> >} data
   */
  static flattenData(comparison, options = {}) {
    const threshold = options.minTime || 0.004;
    const validArgs = new Set();
    const intermediate = {};

    // first, flatten run times into a map
    for (let name in comparison) {
      const runs = new Map();
      for (let entry of comparison[name]) {
        // accumulate results from all runs
        // TODO use normal statistics, not just min()
        runs.set(entry.n, Math.min( entry.time, runs.get(entry.n) ?? Infinity) );
        validArgs.add(entry.n);
      }
      intermediate[name] = runs;
    }

    // now filter the available arguments by result significance
    // we don't want a long tail of zeros, it tells nothing about performance
    const arglist = [...validArgs]
        .filter( n => {
          for (let name in comparison)
            if (intermediate[name].get(n) >= threshold)
              return true;
          return false;
        })
        .sort((x,y) => x-y);

    // finally output processed data
    const out = { n: arglist, times: {} };

    for(let name in comparison) {
      out.times[name] = arglist.map(n => intermediate[name].get(n));
    }

    return out;
  }

  /**
   *
   * @param {int} attempts - how many timer ticks to wait for. default = 15.
   * @return {number} timer resolution in seconds
   */
  static getTimeRes (attempts = 15) {
    const first = getTime();
    let last = first;
    let count = attempts;
    while (count > 0) {
      const now = getTime();
      if (now === last)
        continue;
      last = now;
      count--;
    }
    return (last - first) / (attempts * 1000);
  }
}

ParaBench.prototype.flattenData = ParaBench.flattenData;
ParaBench.prototype.getTimeRes = ParaBench.getTimeRes;

module.exports = { ParaBench };

/* Utility functions */
