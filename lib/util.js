'use strict';

/**
 * @param {number} milliseconds
 * @param {(callback: (result: any) => void) => void} code
 * @return {Promise}
 */
function timedPromise(milliseconds, code) {
    let clock;
    return new Promise( (resolve, reject) => {
        if (milliseconds > 0)
            clock = setTimeout(
                () => {
                    reject('Operation times out after ' + milliseconds + ' ms')
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
        ? process.hrtime
        :
    (typeof performance === 'object' && typeof performance.now === 'function')
        ? performance.now
        : () => (new Date() - 0);

module.exports = { timedPromise, getTime };
