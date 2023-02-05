'use strict';

const { expect } = require('chai');
const { ParaBench} = require ('../lib/paraBench');

describe( 'BigoBench.compare', () => {
  it( 'produces some results', done => {
    const bench = new ParaBench();

    bench.compare({ argList: [13, 21, 34, 55]}, {
      fwd: (n, cb) => { let sum = 0; for (let i = 0; i < n; i++) sum += i; cb(sum) },
      bwd: (n, cb) => { let sum = 0; for (let i = n; i--> 0; ) sum += i; cb(sum) },
    }).then(cmpData => {
      console.log('got some data:', cmpData);
      expect( Object.keys(cmpData).sort() ).to.deep.equal(['bwd', 'fwd']);
      expect( Object.values(cmpData).map( x => x.length) ).to.deep.equal([4,4]);

      // TODO actual tests ^)
      done();
    })
  })
})
