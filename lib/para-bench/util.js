'use strict';

/**
 * @param {string} name
 * @param {number} milliseconds
 * @param {(callback: (result: any) => void) => void} code
 * @return {Promise}
 */
function timedPromise(name, milliseconds, code) {
    let clock;
    return new Promise( (resolve, reject) => {
        if (milliseconds > 0)
            clock = setTimeout(
                () => {
                    reject(name + ' timed out after ' + milliseconds + ' ms')
                },
                milliseconds
            );
        code( clock
            ? result => {
                clearTimeout();
                resolve(result);
            }
            : resolve
        );
    });
}

const getTime =
    (typeof process === 'object' && typeof process.hrtime === 'function')
        ? () => { const [sec, nano] = process.hrtime(); return sec * 1000 + nano / 1_000_000 }
        :
    (typeof performance === 'object' && typeof performance.now === 'function')
        ? () => performance.now()
        : () => (new Date() - 0);

module.exports = { timedPromise, getTime };
