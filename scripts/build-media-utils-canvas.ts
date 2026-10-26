import { canvasDocument } from '../plugins/media-utils/editor/canvas-runtime'

await Bun.write(
	new URL(
		'../plugins/media-utils/editor/canvas-document.generated.ts',
		import.meta.url,
	),
	`// biome-ignore-all format: Generated HTML payload.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Browser JavaScript templates are embedded as text.
const canvasHtml: string = ${JSON.stringify(canvasDocument())}\nexport default canvasHtml\n`,
)
