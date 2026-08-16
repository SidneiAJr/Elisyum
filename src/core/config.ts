import * as crypto from 'crypto';

const BOOT_ENTROPY = Buffer.concat([
    crypto.randomBytes(128),
    Buffer.from(process.hrtime.bigint().toString()),
    crypto.randomBytes(64),
]);

const BOOT_SALT = crypto.randomBytes(64);

const MASTER_KEY = crypto
    .pbkdf2Sync(BOOT_ENTROPY, BOOT_SALT, 100_000, 64, 'sha512')
    .toString('hex');

function resolverAlgoritmo(): 'sha256' | 'sha512' {
    return process.env.ELISIUM_HASH === '256' ? 'sha256' : 'sha512';
}

export const ElisiumConfig = Object.freeze({
    algorithm: resolverAlgoritmo(),
    token:     MASTER_KEY,
});