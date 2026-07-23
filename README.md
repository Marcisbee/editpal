# editpal

## Development

Requires [Deno](https://deno.com/) 2.9 or newer.

```sh
deno ci
deno task dev
```

Available tasks:

- `deno task build` — build the library into `dist/`
- `deno task preview` — build and serve the optimized demo
- `deno task test` — run the Deno test suite
- `deno task check` — type-check the complete application and test graph
- `deno task lint` — lint with Deno
- `deno task fmt` — format with Deno
- `deno task verify` — run formatting, linting, tests, and the production build
