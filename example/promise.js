'use strict';

const { ParaBench } = require('../lib/paraBench');

const bench = new ParaBench();

bench.compare( {maxArg: 1000}, {
    timeout: (n, cb) => {
        const repeat = k => k ? setTimeout(()=>repeat(k-1), 0): cb();
        repeat (n);
    },
    promise: (n, cb) => {
        const repeat = k => k ? Promise.resolve(k-1).then(repeat) : cb();
        repeat(n);
    },
}).then(console.log);
