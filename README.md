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

