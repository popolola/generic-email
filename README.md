# Generic Email: Node DIJ generator

Run the generator with:

```powershell
node app.js
```

It reads `input/data.xlsx` and writes only to `output/node-generated`.

## ID strategies

Set `idStrategy` in `config/engageone.config.js`.

* `precisely-style` (default): a Node-side approximation of the documented
  behavior. It derives `JobGUID` from the DIJ timestamp, derives `docMasterID`
  from the source byte offsets, account number, and statement date, and uses a
  secure UUID for each `docInstanceID`.
* `node`: retains the prior behavior, generating random UUIDs for all three
  IDs.

The Precisely material describes which inputs are hashed but not the published
hash algorithm or its exact input serialization. The `precisely-style` strategy
therefore uses MD5 only to obtain the observed 32-character hexadecimal format.
It is for UAT comparison and must not be described as an exact DOC1 clone.
