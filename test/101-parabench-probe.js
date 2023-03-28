const { expect } = require('chai');
const { ParaBench } = require('../lib/paraBench');

describe('BigoBench', () => {
  it('runs some code & provides summary', (done) => {
    const perf = new ParaBench()
      .setup((n, cb) => cb([...Array(n).keys()].reverse()))
      .teardown((array, cb) => {
        for (let i = 1; i < array.length; i++) {
          if (array[i - 1] > array[i])
            cb('array out of order' + array.join(', '));
        }
        cb();
      });

    const prom = perf.probe({arg: 10000, async: true}, (ary, cb) => cb(ary.sort((x, y) => x - y)) );

    prom.then(out => {
      console.log(out);

      expect(out.n).to.equal(10000);
      expect(out.user).to.be.within(0, Infinity);
      expect(out.system).to.be.within(0, Infinity);
      expect(out.time).to.be.within(0, Infinity);
      expect(out.iter).to.equal(out.time / out.n);
      expect(out.cpu).to.equal(out.user + out.system);

      done();
    });
  });

  it ('has sane default setup & teardown', done => {
    new ParaBench().probe({arg: 1}, n => n ).then(() => done());
  })

  it('can timeout', done => {
    new ParaBench().probe( {arg: 1, timeout: 5, async: true}, (n, cb) => {})
      .then( retVal => {
        done( { expected: 'timeout', got: retVal });
      })
      .catch( err => {
        console.log('error on timeout: ', err);
        expect( err ).to.match( /time.*out\D+5 ms/);
        done();
      });
  });
});
