# App composition

`mysiteapp` is deployed as separate Web Apps from the same repository. Set
`NEXT_PUBLIC_APP_ID` per deployment before running `pnpm build`:

| App ID | Product | Shell | Team |
| --- | --- | --- | --- |
| `camera` | Camera App | Direct camera capture | No |
| `site-memo` | Site Memo App | Standalone top toolbar | No |
| `handover` | Handover App | Standalone top toolbar | No |
| `notebook` | Notebook App | Standalone top toolbar | No |
| `database` | Database App | Standalone top toolbar | No |
| `full` | Full App | Full navigation | Yes |

The default is `full` so existing deployments keep their current behavior.

The application composition is defined in `lib/app-architecture.ts`. Feature
modules must expose contracts instead of importing another module's internal
state. Camera and Album is the canonical owner of photos; consumers should
keep only photo references. The public entry-point contract is in
`lib/photo-module-contract.ts`.

Example build commands:

```powershell
$env:NEXT_PUBLIC_APP_ID = 'camera'
pnpm build
```

Each App can be deployed to its own hostname while using the same repository
and the same shared data contracts.

