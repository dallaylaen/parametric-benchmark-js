'use strict';

const { expect } = require( 'chai' );
const { ParaBench } = require ('../index');

describe( 'ParaBench.check', () => {
    it( 'can catch broken callbacks', done => {
        new ParaBench()
            .add( 'missing', (n, cb) => {})
            .add( 'ok', (n, cb) => cb(n))
            .check(1)
            .then( bad => {
                expect(Object.keys(bad)).to.deep.equal(['missing']);
                expect(Object.values(bad)[0]).to.match(/time.*out.*/);
                done();
            })
            .catch(done);
    })
});
