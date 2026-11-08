export function canvasDocument(script: string) {
	return `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>html,body{margin:0;height:100%;background:#000000;display:flex;align-items:center;justify-content:center;overflow:hidden}canvas{max-width:100%;max-height:100%;object-fit:contain;touch-action:none}</style><body><script>${script}</script>`
}
