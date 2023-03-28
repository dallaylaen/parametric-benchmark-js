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
    this._solution = {};
    this._asyncSolution = {};
    this._onteardownfail = () => {};
    this._progress = () => {};
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
   *
   * The teardown function gets a hash containing the initial numeric argument (n),
   * the input given to code in question (input) and its return value (output) and possibly
   * som additional parameters.
   *
   * It must return via callback (its second argument),
   * either a false value if everything is ok, or the description of the problem if there's one.
   *
   * @param {({n: int, input: any, output: any}, callback: ([string]) => void) => void} fun
   * @returns {ParaBench} self
   */
  teardown (fun) {
    this._teardown = fun;
    return this;
  }

  /**
   * @desc Perform an action whenever teardown doesn't encounter what is was expecting.
   * @param { (error: {n: int, name: string, err: any}) => void } fun
   * @return {ParaBench} this (chainable)
   */
  onTeardownFail(fun) {
    this._onteardownfail = fun;
    return this;
  }

  /**
   * @desc Execute benchmark.
   * @param {Object} options
   * @param {Boolean} [options.async] whether the solution in question returns via a callback
   * @param {String} [options.name] identifier of the solution in question
   * @param {int} options.arg - positive integer parameter to generate input from.
   * @param {number} [options.timeout] - (in milliseconds) when to declare the probe is taking too long
   * @param {(input: any, callback: (retVal: any) => void) => void} userCode (arg, callback) => {...; callback(retVal)}
   * @returns {Promise<CpuStat>}
   */
  probe (options, userCode) {
    const n = options.arg;

    if (!(Number.isInteger(n) && n > 0))
      throw new Error("probe requires positive integer {arg} parameter");

    return timedPromise( 'Setup', options.timeout, resolve => {
      this._setup(n, resolve);
    }).then( arg => timedPromise( 'Solution', options.timeout, resolve => {
      // we have to duplicate a bit of code here
      // to reduce influencing the measurement result.
      if (options.async) {
        /* begin critical section */
        const date1 = getTime();
        const cpu1 = cpuTime();
        userCode(arg, retVal => {
          const date2 = getTime();
          const cpu2 = cpuTime();
          /* end critical section */
          resolve({arg, retVal, date1, date2, cpu1, cpu2});
        });
      } else {
        /* begin critical section */
        const date1 = getTime();
        const cpu1 = cpuTime();
        const retVal = userCode(arg);
        const date2 = getTime();
        const cpu2 = cpuTime();
        /* end critical section */
        resolve({arg, retVal, date1, date2, cpu1, cpu2});
      }
    })).then( hash => timedPromise( 'Teardown', options.timeout, resolve => {
        const info = {n, input: hash.arg, output: hash.retVal};
        this._teardown(info, err => resolve({err, ...hash}));
    })).then( hash => new Promise( resolve => {
      const { cpu1, cpu2, date1, date2, err } = hash;
      const time = (date2 - date1) / 1000;

      const ret = { n, time, iter: time / n };
      if (err) {
        ret.err = err;
        this._onteardownfail({ n, err, name: options.name });
      }
      if (cpu2.user !== undefined) {
        ret.user = (cpu2.user - cpu1.user) / 10 ** 6;
        ret.system = (cpu2.system - cpu1.system) / 10 ** 6;
        ret.cpu = ret.user + ret.system;
      }

      resolve(ret);
    }));
  }

  /**
   *
   * @param name
   * @param {(arg: any, cb: (retVal: any) => void) => void} impl
   * @return {ParaBench}
   */
  add(name, impl) {
    if (typeof impl === 'function') {
      this._solution[name] = impl;
      this._asyncSolution[name] = true;
    } else if (!impl) {
      delete this._solution[impl];
    } else {
      throw new Error('A solution must be a function (or null to erase one)');
    }
    return this;
  }

  /**
   *
   * @return {string[]} list of code variants added this far with add()
   */
  list() {
     return Object.keys(this._solution).sort();
  }

  /**
   *
   * @param {number} timeoutMs in milliseconds
   * @param {int} arg
   * @return {Promise<Object<string, string> | undefined>}
   */
  check(timeoutMs = 1, arg = 1) {
     const gen = Object.keys(this._solution).values();

     const bad = {};
     const iterate = (resolve) => {
       const name = gen.next().value;
       const async = this._asyncSolution[name];
       if (name === undefined)
         return resolve(Object.keys(bad).length === 0 ? undefined : bad);

       this.probe({arg, name, timeout: timeoutMs, async }, this._solution[name])
           .then(unused => iterate(resolve))
           .catch(reason => {
             bad[name] = reason;
             iterate(resolve);
           });
     };
     return new Promise(iterate);
  }

  /**
   *
   * @param {(soFar: object) => void} fun
   * @param {int} fun.soFar.n
   * @param {string} fun.soFar.name
   * @param {CpuStat} fun.soFar.result
   * @param {number} fun.soFar.totalTime
   * @param {number} fun.soFar.percent
   * @return {ParaBench}
   */
  progress(fun) {
     this._progress = fun;
     return this;
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
   * @returns {Promise<Object<string, Array<CpuStat>>>}
   * @example bench.compare( {minArg: 1, maxArg: 10**6, maxTime: 1] }, { qSort, bubbleSort, mergeSort } )
   *              .then( data => { for (let name in data) { plotRuntime( data[name] )}} );
   */
  compare (options = {}) {
    const minArg  = options.minArg ?? 1;
    const maxArg  = options.maxArg ?? Infinity;
    const maxTime = options.maxTime;
    const repeat  = options.repeat ?? 1;

    const variants = { ...this._solution };

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

    // progress bar only:
    let count = 0;
    let totalTime = 0;
    const totalMaxTime = (maxTime ?? 0) * Object.keys(variants).length;

    const iterate = resolve => {
      const next = gen.next().value;
      if (!next)
        return resolve(out);

      const { name, n } = next;
      const async = this._asyncSolution[name];
      return this.probe({arg: n, name, async}, variants[name]).then(piece => {
        const cpu = timeSpent[name] += piece.time;
        if (cpu > maxTime)
          pending.delete(name); // had enough
        out[name].push(piece);
        this._progress({
          name,
          n,
          result: piece,
          count: ++count,
          cumulativeTime: cpu,
          maxTime,
          totalTime: totalTime += piece.time,
          totalMaxTime,
        });
        // Next line could've been just iterate(resolve),
        // but that locks up the browser somehow.
        setTimeout(() => iterate(resolve), 0);
      });
    }

    return new Promise(iterate);
  }


  /**
   * @static
   * @desc Process raw comparison data into something useful for e.g. plotting
   * @param {Object<string, Array<CpuStat>>} comparison Results of a previous compare() call.
   * @param {Object} options
   * @param {number} options.minTime resolution (in second). Default is 0.004.
   * @param {"time"|"cpu"} options.useStat which of the measures stats to use. Default is 'time' (physical time)
   * @returns {Object<n : Array<int>, times : Object<string,Array<number>> >, ops : Object<string, Array<number>>} data
   */
  static flattenData(comparison, options = {}) {
    const threshold = options.minTime || 0.004;
    const useStat   = options.useStat || 'time';
    const validArgs = new Set();
    const intermediate = {};

    // first, flatten run times into a map
    for (let name in comparison) {
      const runs = new Map();
      for (let entry of comparison[name]) {
        // accumulate results from all runs
        // TODO use normal statistics, not just min()
        runs.set(entry.n, Math.min( entry[useStat], runs.get(entry.n) ?? Infinity) );
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
    const out = { n: arglist, times: {}, ops: {} };

    for(let name in comparison) {
      out.times[name] = [];
      out.ops[name] = [];
      for (let n of arglist) {
        const duration = intermediate[name].get(n)
        out.times[name].push(duration);
        out.ops[name].push(n / duration);
      }
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
