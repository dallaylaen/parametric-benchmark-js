# Description

![project logo](docs/img/parametric-benchmark.png)

Measure performance of code snippets over a range of inputs.

* measures user, system, and physical time;
* handles both synchronous and asynchronous code;
* can repeat measurements several times and remove outliers;
* automatically adjusts input size to the code's speed;

# Introduction

The most straightforward way to measure code performance is to run a function over and over again and take average time. This method has some limitations though: it doesn't show dynamics, it is prone to measurement errors, and it cannot handle asynchronous code.

We thus propose a more sophisticated approach.

* The function in question is given an argument that can vary greatly. This allows to not only find out some "operations per second" value but also see how it reacts to changes in the input size.
* We also add a `setup(n, callback)` routine that will produce inputs from a positive integer value, say arrays filled with random data or graphs/trees of the required size. The default is, of course, just n itself.
* And finally we add a `teardown(info, cb)` function that can check the output validity of the output (e.g. random array became sorted, tree became balanced etc.) Fast but wrong code is not what we want. 
* The measurements may be performed multiple times, and statistical analysis may be applied to results afterwards. A browser is quite a noisy environment, so multiple runs are preferable, as well as filtering out outliers (i.e. some other thread/process decided to GC while the code was being run).
* On top of that, setup() and teardown() may return promises, and code in question may return via callback instead of a return statement. The use of asynchronous API has to be specified explicitly, as we don't want to waste time autodetecting promises (as we do with non time-critical code) and thus affect the results of measurements.

# The interface

```javascript
const bench = new ParaBench()
        .setup(n => [... Array(n)].map(_ => Math.random()))
        .add('naive impl', input => { ... /* your code here */ })
        .add('fancy algorithm', input => { ... /* other code here */ });

        bench.compare({minArg: 1000, maxTime: 3, repeat: 10})
                .then(rawData => {
                    console.log(bench.flattenData(rawData));
                });
```

Here's what we do here:

* `setup()` will create arrays filled with random data;
* `add()` will add 2 solutions of the same problem;
* `compare()` will run both solutions over a range of inputs and return a promise;
* and `flattenData()` will filter out outliers and merge meaningful measurements.

# Playground

[https://dallaylaen.github.io/parametric-benchmark-js/](https://dallaylaen.github.io/parametric-benchmark-js/)

# TODO

* Better statistical analysis;
* More profound teardown;
* More documentation & examples;
* Improve playground look & feel;

# Copyright & license

License: MIT.

Copyright (c) 2023 Konstantin Uvarin
