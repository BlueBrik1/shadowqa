import config from "./.shadowqa/eslint.config.mjs";

export default [
  { ignores: ["node_modules/**", "build/**", "public/**", "plugins/**", "scripts/**", "src/components/ui/**"] },
  ...config,
];
