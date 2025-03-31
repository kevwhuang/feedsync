import { eslint } from '@aephonics/config';

const ignores = [
    '',
];

const globals = [
    '',
];

const overrides = [
    {
        files: ['main.ts'],
        languageOptions: { globals: Object.fromEntries(globals.map(e => [e, true])) },
        rules: {
            'no-await-in-loop': 0,
            'no-continue': 0,
        },
    },
];

eslint.push(...overrides);
eslint.forEach(e => (e.ignores = ignores));

export default eslint;
