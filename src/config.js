const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET es obligatorio cuando NODE_ENV=production');
}

module.exports = {
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-solo-para-desarrollo',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
    BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS) || 10
};
