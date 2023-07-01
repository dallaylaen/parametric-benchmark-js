'use strict';

const { expect } = require( 'chai' );
const { ParaBench } = require( '../lib/para-bench.js' );

describe( 'ParaBench.flattenData', () => {
    it('squashes diff measurements into one', done => {
        const input = {
            foo: [{n: 1, time: 1}, {n: 1, time: 2}, {n: 1, time: 3}, {n: 1, time: 4}, {n: 1, time: 5}, ]
        };
        const result = ParaBench.flattenData(input);

        console.log(result);

        expect(result?.n).to.deep.equal([1]);
        expect(result?.times?.foo?.length).to.equal(result.n.length);
        expect(result?.times?.foo?.length).to.equal(result.n.length);
        expect(result.times.foo[0]).to.be.within(2.999, 3.001);
        expect(result.ops.foo[0]).to.be.within(1/3.001, 1/2.999);

        done();
    });
})
