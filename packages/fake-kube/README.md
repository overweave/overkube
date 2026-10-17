# @overkube/fake-kube

A fake Kubernetes API server for overkube's own tests on Node, behaving as the real one does where the [connector](../connector/README.md) and the [source](../source/README.md) depend on it (the [gateway](../gateway/README.md) in front): aggregated discovery; an object by name; lists in pages of one snapshot (`limit`, `continue`; 410 once expired), by name and labels, metadata only; watches from a `resourceVersion` (410 when compacted); 403 for forbidden paths, 401 for a token no longer taken; what the user may do (SelfSubjectRulesReview); a container's log, written by the test and followed. `new FakeKube(served)`, `kindOf(...)`; every request recorded.

Private: never published. Used by `*.node.test.ts` in the workspace.
