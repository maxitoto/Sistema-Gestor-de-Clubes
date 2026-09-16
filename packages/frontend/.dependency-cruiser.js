module.exports = {
	options: {
		tsConfig: { fileName: 'tsconfig.json' },
		doNotFollow: { path: 'node_modules' },
	},

	forbidden: [
		// ==========================================
		// FSD — JERARQUÍA VERTICAL (sin cambios, correctas)
		// ==========================================
		{
			name: 'shared-no-depende-de-capas-superiores',
			comment:
				'shared es la capa más baja del FSD. No puede importar de entities, features, widgets, pages ni app. Solo puede importar de sí misma.',
			severity: 'error',
			from: { path: '^src/shared' },
			to: { path: '^src/(entities|features|widgets|pages|app)' },
		},
		{
			name: 'entities-solo-importa-de-shared',
			comment:
				'entities es la segunda capa más baja. Solo puede importar de shared. Prohibido importar de features, widgets, pages o app.',
			severity: 'error',
			from: { path: '^src/entities' },
			to: { path: '^src/(features|widgets|pages|app)' },
		},
		{
			name: 'features-solo-importa-de-entities-y-shared',
			comment:
				'features puede importar de entities y shared (capas inferiores). Prohibido importar de widgets, pages o app (capas superiores).',
			severity: 'error',
			from: { path: '^src/features' },
			to: { path: '^src/(widgets|pages|app)' },
		},
		{
			name: 'widgets-solo-importa-de-features-entities-y-shared',
			comment:
				'widgets puede importar de features, entities y shared. Prohibido importar de pages o app.',
			severity: 'error',
			from: { path: '^src/widgets' },
			to: { path: '^src/(pages|app)' },
		},
		{
			name: 'pages-solo-importa-de-widgets-features-entities-y-shared',
			comment:
				'pages puede importar de widgets, features, entities y shared. Prohibido importar de app (pages no debe conocer el router ni los providers globales).',
			severity: 'error',
			from: { path: '^src/pages' },
			to: { path: '^src/app' },
		},

		// ==========================================
		// FSD — AISLAMIENTO ENTRE SLICES (con backreference)
		// ==========================================
		{
			name: 'slices-de-features-no-se-importan-entre-si',
			comment:
				'Dos slices distintas dentro de features/ no pueden importarse entre sí. Los archivos de una misma slice sí pueden importarse libremente (por eso el backreference $1 excluye el propio slice).',
			severity: 'error',
			from: { path: '^src/features/([^/]+)/' },
			to: { path: '^src/features/(?!$1)([^/]+)/' },
		},
		{
			name: 'slices-de-entities-no-se-importan-entre-si',
			comment:
				'Dos slices distintas dentro de entities/ no pueden importarse entre sí. Si dos entidades necesitan compartir algo, ese algo debe bajar a shared.',
			severity: 'error',
			from: { path: '^src/entities/([^/]+)/' },
			to: { path: '^src/entities/(?!$1)([^/]+)/' },
		},
		{
			name: 'slices-de-widgets-no-se-importan-entre-si',
			comment:
				'Dos slices distintas dentro de widgets/ no pueden importarse entre sí. Si dos widgets comparten lógica, debe extraerse a features o entities.',
			severity: 'error',
			from: { path: '^src/widgets/([^/]+)/' },
			to: { path: '^src/widgets/(?!$1)([^/]+)/' },
		},

		// ==========================================
		// FSD — PUBLIC API (imports entre capas)
		// Solo permite archivos index.ts(x|js|jsx) como API pública.
		// Al separar por capa origen, excluimos same-slice de forma natural.
		// ==========================================
		{
			name: 'app-solo-importa-por-barrel-de-capas-inferiores',
			comment:
				'app debe importar de pages, widgets, features y entities únicamente a través de su index.ts (API pública). Prohibido el deep import a archivos internos.',
			severity: 'error',
			from: { path: '^src/app/' },
			to: {
				path: '^src/(pages|widgets|features|entities)/.+',
				pathNot: 'index\\.(ts|tsx|js|jsx)$',
			},
		},
		{
			name: 'pages-solo-importa-por-barrel-de-capas-inferiores',
			comment:
				'pages debe importar de widgets, features y entities únicamente a través de su index.ts. Prohibido el deep import a archivos internos de esas capas.',
			severity: 'error',
			from: { path: '^src/pages/' },
			to: {
				path: '^src/(widgets|features|entities)/.+',
				pathNot: 'index\\.(ts|tsx|js|jsx)$',
			},
		},
		{
			name: 'widgets-solo-importa-por-barrel-de-capas-inferiores',
			comment:
				'widgets debe importar de features y entities únicamente a través de su index.ts. Prohibido el deep import a archivos internos.',
			severity: 'error',
			from: { path: '^src/widgets/' },
			to: {
				path: '^src/(features|entities)/.+',
				pathNot: 'index\\.(ts|tsx|js|jsx)$',
			},
		},
		{
			name: 'features-solo-importa-por-barrel-de-entities',
			comment:
				'features debe importar de entities únicamente a través de su index.ts. Prohibido el deep import a archivos internos de entities.',
			severity: 'error',
			from: { path: '^src/features/' },
			to: {
				path: '^src/entities/.+',
				pathNot: 'index\\.(ts|tsx|js|jsx)$',
			},
		},
	],
};
