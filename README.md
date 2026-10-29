## NodeJS Postgres DB Service

## Protocol Specs API

All endpoints are prefixed with `/protocol-specs`.

### POST `/protocol-specs/specs`

Ingest a gzip-compressed `build.yaml` and an optional gzip-compressed validation table into MongoDB.

**Headers**

| Header         | Value                     |
| -------------- | ------------------------- |
| Content-Type   | multipart/form-data       |

**Form Fields**

| Field             | Required | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `spec`            | Yes      | Gzip-compressed `build.yaml`                     |
| `validationTable` | No       | Gzip-compressed validation table JSON file       |

**Example (curl / shell)**

```bash
curl -X POST https://api.example.com/protocol-specs/specs \
  -H "x-api-key: $X_API_KEY" \
  -F "spec=@build.yaml.gz;type=application/octet-stream" \
  -F "validationTable=@raw_table.json.gz;type=application/octet-stream"
```

Or use the bundled `ingest-spec.sh` script:

```bash
export X_API_KEY=your-key
./ingest-spec.sh -f build.yaml -t raw_table.json -u https://api.example.com
```

**Response**

```json
{
  "message": "Build ingested successfully",
  "domain": "ONDC:FIS10",
  "version": "2.1.0",
  "changes": 12
}
```

If the build was already ingested (identical hash):

```json
{
  "message": "Build already ingested (identical hash)",
  "domain": "ONDC:FIS10",
  "version": "2.1.0"
}
```

---

### GET `/protocol-specs/specs/:domain/:version`

Fetch stored spec data for a given domain and version.

**Path Parameters**

| Param     | Description                        | Example      |
| --------- | ---------------------------------- | ------------ |
| `domain`  | The ONDC domain identifier         | `ONDC:FIS10` |
| `version` | The build version                  | `2.1.0`      |

**Query Parameters**

| Param     | Description                                                                 | Example                    |
| --------- | --------------------------------------------------------------------------- | -------------------------- |
| `include` | Comma-separated sections to return (defaults to all)                        | `meta,flows,attributes`    |
| `usecase` | Filter flows by `usecase` and attributes by `useCaseId`                     | `search`                   |
| `flowId`  | Filter flows by `flowId`                                                    | `flow-1`                   |
| `tag`     | Filter flows by tag                                                         | `mandatory`                |
| `docSlug` | Filter docs by slug                                                         | `getting-started`          |

**Valid `include` values**: `meta`, `flows`, `attributes`, `docs`, `validations`, `changelog`, `validationTable`

**Example**

```
GET /protocol-specs/specs/ONDC:FIS10/2.1.0?include=flows,attributes&usecase=search&tag=mandatory
GET /protocol-specs/specs/ONDC:FIS10/2.1.0?include=validationTable
GET /protocol-specs/specs/ONDC:FIS10/2.1.0?include=meta,validationTable
```

**Response**

```json
{
  "flows": [ ... ],
  "attributes": [ ... ]
}
```

Returns `404` if no spec is found for the given domain/version.


---

## FD certification records

For FD (`ONDC:FIS14:FD`), a full Protocol Workbench pass is a go-live certificate. These endpoints store the certification records, issue and sign them, verify them, lapse them after spec changes, record appeals, and answer the onboarding go-live check. The certificate process itself (publishing status, handling refusals) is a separate design and is not built here.

**Environment**

| Variable              | Description                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `FD_CERT_SIGNING_KEY` | Base64 32-byte Ed25519 seed: the Network Admin (N-04) certification key, not a workbench mock identity |
| `FD_CERT_KEY_ID`      | Key ID recorded in every signature                                                                 |

Without a usable key, issuing, lapsing and verifying return `503`. Nothing is stored unsigned, and go-live answers `allowed: false`.

**Issuance rule.** The server applies it (fail-closed); the caller cannot set `verdict`, `status`, `issuer`, `issuedAt`, `certificateId` or `signature`. The verdict is `PASS`, and the status `VALID`, only if:
- coverage is not empty;
- every requirement in it is `PASS` (with at least one scenario and one evidence ID) or `WAIVED` (with a waiver recorded for that ID);
- every finding is waived: each requirement ID it cites has a waiver.

Anything else is stored with verdict `FAIL` and status `REFUSED`. The record exists, but it is not a certificate.

**Signature.** Ed25519 over the RFC 8785 canonical JSON of the record as the API returns it, without `signature` and without `appeals`. A lapse re-signs the record because `status` is signed. A record edited in the database therefore fails verification, and go-live refuses it.

| Method & path                                              | Auth    | Body / query                                             | Response                                                                                                    |
| ---------------------------------------------------------- | ------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /certificates`                                       | API key | run summary (below)                                      | `201 { certificate, reasons[] }`, VALID or REFUSED                                                          |
| `GET /certificates/:id`                                    | API key |                                                          | the certificate record, with `appeals[]`                                                                    |
| `GET /certificates?subscriberId=&domain=&role=`            | API key | all filters optional                                     | records, the latest VALID first                                                                             |
| `GET /certificates/:id/verify`                             | public  |                                                          | `{ certificateId, signatureValid, reason?, keyId, algorithm, status, verdict, subscriberId, role, domain, version, issuedAt, lapsedAt? }` |
| `POST /certificates/lapse`                                 | API key | `{ domain, version, requirementIds[] }`                  | `{ domain, specVersion, lapsed, certificateIds[], notResigned[] }`                                          |
| `POST /certificates/:id/appeals`                           | API key | `{ runId, requirementId, statement, raisedBy }`          | `201 { appealId, runId, requirementId, statement, raisedBy, raisedAt, status: "OPEN" }`                     |
| `GET /certificates/go-live?subscriberId=&domain=&role=`    | API key | all required                                             | `{ allowed, certificateId?, reason, detail }`                                                               |

Run summary for `POST /certificates`:

```json
{
  "subscriberId": "issuer.example.com",
  "role": "DEPOSIT_ISSUER",
  "domain": "ONDC:FIS14:FD",
  "version": "0.1.4",
  "tableHash": "sha256:…",
  "toolVersions": { "build-tools": "…", "ondc-code-generator": "…", "fd-contract": "…" },
  "runs": [{ "sessionId": "…", "flowId": "…", "transactionId": "…", "startedAt": "2026-10-29T10:00:00Z", "finishedAt": "2026-10-29T10:20:00Z", "seed": "…" }],
  "coverage": { "FD-PRD-04": { "status": "PASS", "scenarios": ["…"], "evidence": ["message-id"] } },
  "findings": [{ "requirementIds": ["FD-PRD-05"], "rule": "…", "errorCode": "…", "fieldPath": "…", "detail": "…", "messageId": "…", "action": "…" }],
  "waivers": [{ "requirementId": "FD-NFR-02", "reason": "…", "approvedBy": "…", "approvedAt": "2026-10-29T09:00:00Z" }]
}
```

- **Lapse** marks `LAPSED` every `VALID` certificate in `domain` whose coverage includes any of `requirementIds`. It records `lapsedAt` and `lapseReason: { specVersion, requirementIds }` (only the IDs that certificate covered). Pass every ID for an envelope or context change, and none for an editorial change. A certificate whose stored signature no longer verifies is lapsed but not re-signed, and is listed in `notResigned`.
- **Appeals** must cite a run on the certificate, by its `transactionId` or its `sessionId`, and a requirement ID on it (in coverage, a finding or a waiver). Otherwise the response is `422`.
- **Go-live** allows only a `VALID`, `PASS` certificate for that subscriber, domain and role whose signature verifies. The `reason` is one of `VALID_CERTIFICATE`, `NO_CERTIFICATE`, `CERTIFICATE_LAPSED`, `CERTIFICATE_REFUSED` or `CERTIFICATE_INVALID` (a VALID record that fails verification). If the key is missing, the response is `503` with `VERIFICATION_UNAVAILABLE`. A later refused run does not revoke an earlier VALID certificate; only a lapse does.
