'use strict';

const { expect } = require('chai');
const { ParaBench} = require ('../lib/paraBench');

describe( 'BigoBench.compare', () => {
  it( 'produces some results', done => {
    const bench = new ParaBench();

    bench.compare({ maxTime: 0.025 }, {
      fwd: (n, cb) => { let sum = 0; for (let i = 0; i < n; i++) sum += i; cb(sum) },
      bwd: (n, cb) => { let sum = 0; for (let i = n; i--> 0; ) sum += i; cb(sum) },
    }).then(cmpData => {
      // console.log('got some data:', cmpData);
      expect( Object.keys(cmpData).sort() ).to.deep.equal(['bwd', 'fwd']);
      // expect( Object.values(cmpData).map( x => x.length) ).to.deep.equal([4,4]);

      // console.log('alive');
      const processed = bench.flattenData(cmpData);
      console.log(processed);
      expect( Object.keys(processed).sort() ).to.deep.equal( ['n', 'times']);
      expect( Object.keys(processed.times).sort() ).to.deep.equal( ['bwd', 'fwd'])

      expect( processed.n.length ).to.be.within(1, Infinity);
      expect( processed.times.fwd.length ).to.equal( processed.n.length );
      expect( processed.times.bwd.length ).to.equal( processed.n.length );

      // enforce processed.n to be sorted
      expect( processed.n ).to.deep.equal( processed.n.map(x=>x).sort((x,y) => x-y) );

      // TODO actual tests ^)
      done();
    }).catch( err => done(err) );
  })
})
