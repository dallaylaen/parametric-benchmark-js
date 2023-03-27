(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

      /* begin critical section */
      const date1 = getTime();
      const cpu1 = cpuTime();
      userCode(arg, retVal => {
        const cpu2 = cpuTime();
        const date2 = getTime();
        /* end critical section */
        resolve({arg, retVal, date1, date2, cpu1, cpu2});
      });
    })).then( hash => timedPromise( 'Teardown', options.timeout, resolve => {
        const info = {n, input: hash.arg, output: hash.retVal};
        this._teardown(info, err => resolve({err, ...hash}));
    })).then( hash => new Promise( resolve => {
      const { cpu1, cpu2, date1, date2, err } = hash;
      const time = (date2 - date1) / 1000;

      const ret = { n, time, iter: time / n };
      if (err) {
        ret.err = err;
        this._onteardownfail({ n, err, name: options.name })
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
    if (typeof impl === 'function')
      this._solution[name] = impl;
    else if (!impl) {
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
       if (name === undefined)
         return resolve(Object.keys(bad).length === 0 ? undefined : bad);

       this.probe({arg, timeout: timeoutMs}, this._solution[name])
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
   * @param {Object<string, (input: any, callback: (any) => void) => void>} variants name => function, name2 => function2 ...
   * @returns {Promise<Object<string, Array<CpuStat>>>}
   * @example bench.compare( {minArg: 1, maxArg: 10**6, maxTime: 1] }, { qSort, bubbleSort, mergeSort } )
   *              .then( data => { for (let name in data) { plotRuntime( data[name] )}} );
   */
  compare (options = {}, variants) {
    const minArg  = options.minArg ?? 1;
    const maxArg  = options.maxArg ?? Infinity;
    const maxTime = options.maxTime;
    const repeat  = options.repeat ?? 1;

    if (!variants)
      variants = { ...this._solution };

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
      return this.probe({arg: n, name}, variants[name]).then(piece => {
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

},{"./util":2,"process/":3}],2:[function(require,module,exports){
(function (process){(function (){
'use strict';

/**
 * @param {string} name
 * @param {number} milliseconds
 * @param {(callback: (result: any) => void) => void} code
 * @return {Promise}
 */
function timedPromise(name, milliseconds, code) {
    let clock;
    return new Promise( (resolve, reject) => {
        if (milliseconds > 0)
            clock = setTimeout(
                () => {
                    reject(name + ' timed out after ' + milliseconds + ' ms')
                },
                milliseconds
            );
        code( clock
            ? result => {
                clearTimeout();
                resolve(result);
            }
            : resolve
        );
    });
}

const getTime =
    (typeof process === 'object' && typeof process.hrtime === 'function')
        ? () => { const [sec, nano] = process.hrtime(); return sec * 1000 + nano / 1_000_000 }
        :
    (typeof performance === 'object' && typeof performance.now === 'function')
        ? () => performance.now()
        : () => (new Date() - 0);

module.exports = { timedPromise, getTime };

}).call(this)}).call(this,require('_process'))
},{"_process":3}],3:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],4:[function(require,module,exports){
const { ParaBench } = require( './lib/paraBench');
window.ParaBench = ParaBench;

},{"./lib/paraBench":1}]},{},[4]);
