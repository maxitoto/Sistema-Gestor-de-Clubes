// ./vite.ts.config.paths.ts
import { writeFileSync } from "fs"
import { resolve } from "path"

//agregar alias aquí
const aliases = [
  { alias: '#', path: 'src' },
  { alias: '#app', path: 'src/app' },
  { alias: '#features', path: 'src/features' },
  { alias: '#pages', path: 'src/pages' },
  { alias: '#widgets', path: 'src/widgets' },
  { alias: '#entities', path: 'src/entities' },
  { alias: '#shared', path: 'src/shared' }
];   

type Aliases = {
  [key: string]: string
}

type Alias = {
  alias: string
  path: string
}

//transformar un arreglo de objetos a un unico objeto para vite ejemplo   '@': resolve(__dirname, './src'), '@components': resolve(__dirname, './src/components'),
export const viteAliases: Aliases = aliases.reduce((acc: Aliases, alias: Alias) => {
  acc[alias.alias] = resolve(__dirname, "./"+alias.path)
  return acc
}, {})


//crea un archivo de alias (json) para tsconfig.node y tsconfig.app
//el formato por seguridad es: "@/*": ["src/*"], "@/": ["src/"], de un lado tenemos * y del otro no lo tenemos
export const tsconfigPaths = aliases.reduce((acc, { alias, path }) => ({
    ...acc,
    [`${alias}/*`]: [`${path}/*`],
    [`${alias}/`]:  [`${path}/`]
  }), {} as Record<string, string[]>);


const jsonContent = JSON.stringify({
  compilerOptions: {
    ignoreDeprecations: "6.0",
    baseUrl: ".",
    paths: tsconfigPaths
  }
});

const outputPath = './tsconfig.paths.json';
writeFileSync(outputPath, jsonContent);


