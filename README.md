# peaOS Officially Certificates

> Official certificate registry and publication service for peaOS.

## peaCloud Certificates

**[Open peaCloud Certificates](https://alexiusandromedavsgalaxia-lgtm.github.io/peaOS.Officialy-certificates/)**

The website reads the authoritative registry from this repository, verifies its schema and displays published signing certificates.

## Authoritative registry

`registry.json` is the authoritative certificate registry. The copies under `web/` are deployment copies used by GitHub Pages.

A certificate created in the website is not treated as official merely because it exists in browser storage. The **Publish** flow creates an authenticated publication request. A repository workflow validates the request, writes the certificate to `registry.json`, refreshes the GitHub Pages copy and regenerates this README.

The peaOS repository separately synchronizes the authoritative registry into its own `registry.json` so the OS source tree can consume the same published records.

## Registry status

<!-- REGISTRY:START -->
## Current status

**Known certificates: 0**

| Field | Value |
|---|---:|
| Known certificates | 0 |
| Active | 0 |
| Revoked | 0 |
| Expired | 0 |
| Invalid | 0 |
| Server unavailable | 0 |
| Local distribution | 0 |
| Web Distribution | 0 |
| Registered applications | 0 |
| Registered websites | 0 |

## Certificate registry

_No certificates are currently registered._
<!-- REGISTRY:END -->

## Publication flow

1. The website generates a certificate record and computes its SHA-512 fingerprint.
2. **Publish** creates a GitHub publication request containing the exact record.
3. The repository workflow accepts publication requests from the authorized repository owner, validates the record and appends it to `registry.json`.
4. The workflow copies the registry to `web/registry.json` and regenerates this README.
5. The peaOS repository's synchronization workflow imports the same registry into its own `registry.json`.
6. The website's live sync detects the new official entry and displays it as an official certificate instead of a local draft.

No certificate is fabricated when the registry is empty, and browser-local state is never treated as authoritative.

## Security model

The registry uses the `SigningCertificate` type and `R35-SHA512` authentication metadata. Published entries must contain a 128-character lowercase SHA-512 value and a 32-character lowercase hexadecimal certificate ID.

The publication workflow is intentionally restricted to the authorized repository owner. Public visitors can inspect the registry but cannot directly turn arbitrary browser-local records into official certificates.
