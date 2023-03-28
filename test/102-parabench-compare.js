'use strict';

const { expect } = require('chai');
const { ParaBench} = require ('../lib/paraBench');

describe( 'BigoBench.compare', () => {
  it( 'produces some results', done => {
    const trace = {};
    const bench = new ParaBench()
        .progress(soFar => {
            if(!trace[soFar.name])
                trace[soFar.name] = [];
            trace[soFar.name].push(soFar.result);
        })
        .addAsync('fwd', (n, cb) => { let sum = 0; for (let i = 0; i < n; i++) sum += i; cb(sum) })
        .addAsync('bwd', (n, cb) => { let sum = 0; for (let i = n; i--> 0; ) sum += i; cb(sum) })
        ;

    expect( bench.list() ).to.deep.equal( ['bwd', 'fwd'] );

    bench.compare({ maxTime: 0.01 } ).then(cmpData => {
      // console.log('got some data:', cmpData);
      expect( Object.keys(cmpData).sort() ).to.deep.equal(['bwd', 'fwd']);
      // expect( Object.values(cmpData).map( x => x.length) ).to.deep.equal([4,4]);

      // console.log('alive');
      const processed = bench.flattenData(cmpData, {minTime: 0.0001});
      console.log(processed);
      expect( Object.keys(processed).sort() ).to.deep.equal( ['n', 'ops', 'times']);
      expect( Object.keys(processed.times).sort() ).to.deep.equal( ['bwd', 'fwd'])

      expect( processed.n.length ).to.be.within(1, Infinity);
      expect( processed.times.fwd.length ).to.equal( processed.n.length );
      expect( processed.times.bwd.length ).to.equal( processed.n.length );

      // enforce processed.n to be sorted
      expect( processed.n ).to.deep.equal( processed.n.map(x=>x).sort((x,y) => x-y) );

      // TODO actual tests ^)

      expect( trace ).to.deep.equal( cmpData );
      done();
    }).catch( err => done(err) );
  });

  it('can handle both sync & async functions', done => {
      const bench = new ParaBench()
          .add('simple', n => n)
          .addAsync('callback', (n, cb) => cb(n));
      bench.compare({maxArg: 10}).then(
          result => {
              expect(Object.keys(result).sort()).to.deep.equal(['callback', 'simple']);
              expect(result.simple.length).to.equal(6);
              expect(result.callback.length).to.equal(6);
              done();
          }
      ).catch(done);
  });
})
