import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
	...nextCoreWebVitals,
	...nextTypescript,
	{
		ignores: [
			"node_modules/**",
			".next/**",
			".open-next/**",
			// `wrangler deploy` leaves generated worker bundles here, which otherwise drown
			// real findings in thousands of warnings from third-party code.
			".wrangler/**",
			"out/**",
			"build/**",
			"next-env.d.ts",
			"cloudflare-env.d.ts",
		],
	},
];

export default eslintConfig;
