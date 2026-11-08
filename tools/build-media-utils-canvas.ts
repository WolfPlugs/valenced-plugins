import { fileURLToPath } from 'node:url'
import { canvasDocument } from '../plugins/media-utils/editor/runtime/document'

// Bundle browser modules before embedding them in the React Native plugin.
// Function.toString() cannot retain imports when the runtime is split into files.
const runtime = await Bun.build({
	entrypoints: [
		fileURLToPath(
			new URL(
				'../plugins/media-utils/editor/runtime/canvas.ts',
				import.meta.url,
			),
		),
	],
	target: 'browser',
	format: 'iife',
	minify: true,
})
if (!runtime.success)
	throw new AggregateError(runtime.logs, 'Media editor runtime build failed')
const script = await runtime.outputs[0]!.text()
await Bun.write(
	new URL(
		'../plugins/media-utils/editor/canvas-document.generated.ts',
		import.meta.url,
	),
	`// biome-ignore-all format: Generated HTML payload.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Browser JavaScript templates are embedded as text.
const canvasHtml: string = ${JSON.stringify(canvasDocument(script))}\nexport default canvasHtml\n`,
)
