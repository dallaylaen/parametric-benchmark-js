'use strict';

const { Univariate } = require('stats-logscale');
const { ParaBench } = require('../lib/para-bench');

const repeat = (n, cb) => n > 0 ? process.nextTick( _ => repeat(n-1, cb)) : cb();

const bench = new ParaBench().addAsync('time0', repeat);

bench.compare({argList: [200], repeat: 1000}).then( data => {
    const stat = new Univariate();
    stat.add(...data['time0'].map( x => x.time ) );
    console.log(JSON.stringify(stat));
});

