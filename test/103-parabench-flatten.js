'use strict';

const { expect } = require( 'chai' );
const { ParaBench } = require( '../index.js' );

describe( 'ParaBench.flattenData', () => {
    it('squashes diff measurements into one', done => {
        const input = {
            foo: [{n: 1, time: 0.1}, {n: 1, time: 0.2}, {n: 1, time: 0.3}, {n: 1, time: 0.4}, {n: 1, time: 0.5}, ]
        };
        expect(ParaBench.flattenData(input)).to.deep.equal({
            n: [1],
            times: {
                foo: [0.1]
            }
        });

        done();
    });
})
