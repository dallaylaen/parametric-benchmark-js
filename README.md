# Description

Measure performance of code snippets over a range of inputs.

* measures user, system, and physical time;

* can handle both synchronous and async code;

* can compare ways to do the same thing;

# A single measurement

Measurements are performed via `probe` function which takes two arguments, a positive integer `n` and a user function (aka `code in question`), and returns a promise. 

Here's roughly what happens when `probe(n, myfun)` is called:

* A sample input is generated from `n` and returned through a callback. The default is,
 of course, `n` itself. This is handled by the `setup` method.

* The input is given to `myfun`, together with a callback to return through. 

* As soon as `myfun` finishes, cpu usage and physical time is measured and an object containing the results as well as `n` is generated.

* Optionally, a post-run hook is executed. See `teardown`.

* Finally, the promise is fulfilled with the results of the measurement.

```javascript
const { ParaBench } = require( 'parametric-benchmark');
const bench = new ParaBench();
bench.setup((n, cb) => cb(new Array(n).fill(0).map( _ => Math.random() )))
bench.probe(10**6, (list, cb) => cb(list.sort((x, y) => x - y)))
    .then( console.log );
```

# Multiple measurements

A set of `probe`s may be performed over a range of inputs and a variety of code snippets via the `compare` method:

```javascript
bench.compare({minArg: 10**3, maxArg: 10**6, maxTime: 1}, {
    bubbleSort: (list, cb) => { ... },
    mergeSort:  (list, cb) => { ... },
    quickSort:  (list, cb) => { ... },
}).then(console.log);
```

# Why so complicated?

The use of callbacks allows to handle both sync and async code snippets.

The use of generated inputs instead of just repetition allows to check how algorithm reacts to changes in data size.

Testing over spans of possible inputs may catch interesting edge cases such as cache misses as well as asymptotic algorithm complexity.

# TODO

* More documentation. 

* More features.

* An interactive playground.

* Use a library to generate graphs.

# Author

License: MIT.

Copyright (c) 2023 Konstantin Uvarin
