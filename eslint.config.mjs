import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Use useConfirm() from components/ConfirmDialog, never the browser's alert/confirm/prompt.
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use useConfirm() from components/ConfirmDialog." },
        { name: "alert", message: "Show a message in the page or use useConfirm()." },
        { name: "prompt", message: "Use a form field instead." },
      ],
    },
  },
];

export default eslintConfig;
