// Filet de sécurité avant déploiement.
// Volontairement resserré : on ne signale que ce qui casse réellement l'application
// (variable inexistante, hook mal placé, code inatteignable), pas les questions de style.
// Le but est qu'un « npm run lint » sans erreur veuille dire quelque chose.

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "public/**", "api/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      // ── Les erreurs qui cassent vraiment ──────────────────────────────
      "no-undef": "error",                    // variable ou fonction qui n'existe pas
      "no-dupe-keys": "error",                // deux fois la même clé dans un objet
      "no-dupe-args": "error",
      "no-unreachable": "error",              // code après un return
      "no-cond-assign": "error",
      "no-const-assign": "error",
      "no-obj-calls": "error",
      "no-func-assign": "error",
      "valid-typeof": "error",
      "use-isnan": "error",

      // ── React ─────────────────────────────────────────────────────────
      "react-hooks/rules-of-hooks": "error",  // un hook dans une condition = plantage
      "react/jsx-no-undef": "error",          // composant utilisé mais jamais défini
      "react/jsx-key": "error",               // liste sans clé : lignes qui se mélangent
      "react/no-direct-mutation-state": "error",
      "react/jsx-no-duplicate-props": "error",

      // ── Signalé sans bloquer ─────────────────────────────────────────
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],

      // ── Hors sujet ici ───────────────────────────────────────────────
      "no-console": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
];
