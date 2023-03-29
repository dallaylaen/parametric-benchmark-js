'use strict';

const { expect } = require( 'chai' );
const { ParaBench } = require ('../lib/para-bench');

describe( 'ParaBench.check', () => {
    it( 'can catch broken callbacks', done => {
        new ParaBench()
            .addAsync( 'missing', (n, cb) => {})
            .addAsync( 'ok', (n, cb) => cb(n))
            .check(1)
            .then( bad => {
                expect(Object.keys(bad)).to.deep.equal(['missing']);
                expect(Object.values(bad)[0]).to.match(/time.*out.*/);
                done();
            })
            .catch(done);
    });

    it( 'returns nothing on success', done => {
        new ParaBench()
            .addAsync( 'ok', (n, cb) => cb(n))
            .check(1)
            .then( bad => {
                expect(bad).to.equal(undefined);
                done();
            })
            .catch(done);
    })
});
