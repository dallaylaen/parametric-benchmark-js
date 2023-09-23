'use strict';

const { Univariate } = require('stats-logscale');
const { ParaBench } = require('../lib/para-bench');

const repeat = (n, cb) => n > 0 ? setTimeout( _ => repeat(n-1, cb), 0) : cb();

const bench = new ParaBench().addAsync('time0', repeat);

bench.compare({maxTime: 10, repeat: 300}).then( data => {
    const stat = new Univariate();
    stat.add(...data['time0'].map( x => x.time ) );
    console.log(JSON.stringify(stat));
});

