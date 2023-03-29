'use strict';

const { ParaBench } = require('../lib/para-bench');

const bench = new ParaBench();

bench.compare({maxArg: 1000000}, {
    list: (n, cb) => {
        let head = null;
        while (n-->0)
            head = [head];
        cb();
    },
}).then(console.log);
