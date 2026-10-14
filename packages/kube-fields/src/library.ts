/*
 * Functions of an object written in CEL, the fields' own library: one is
 * worked out once for each object, however many fields ask it.
 * - podSummary(self): a pod as kubectl prints it — its reason (its STATUS:
 *   Init:N/M, CrashLoopBackOff, Terminating, Completed…), how many of its
 *   containers are ready of how many (sidecars counted), its restarts — as
 *   kube-types' podSummary works it out (its reference, in the tests).
 * A field that calls it is of its version (its tree; those it calls).
 */
export const LIBRARY: Readonly<Record<string, string>> = {
  podSummary: `
cel.bind(st, self.?status.orValue({}),
cel.bind(phase, st.?phase.orValue(""),
cel.bind(conds, st.?conditions.orValue([]),
cel.bind(initSpecs, self.?spec.?initContainers.orValue([]),
cel.bind(sidecars, initSpecs.filter(c, c.?restartPolicy.orValue("") == "Always").map(c, c.name),
cel.bind(iss, st.?initContainerStatuses.orValue([]),
cel.bind(blocked, iss.map(c,
    !(c.?state.?terminated.hasValue() && c.state.terminated.?exitCode.orValue(0) == 0)
    && !(c.name in sidecars && c.?started.orValue(false))),
cel.bind(bi, blocked.indexOf(true),
cel.bind(initializing, bi >= 0,
cel.bind(seen, initializing ? iss.slice(0, bi + 1) : iss,
cel.bind(mainRun, !initializing || conds.exists(c, c.?type.orValue("") == "Initialized" && c.?status.orValue("") == "True"),
cel.bind(base,
    conds.exists(c, c.?type.orValue("") == "PodScheduled" && c.?reason.orValue("") == "SchedulingGated") ? "SchedulingGated"
    : st.?reason.orValue("") != "" ? st.reason : phase,
cel.bind(initReason, !initializing ? base : cel.bind(c, iss[bi],
    c.?state.?terminated.hasValue() ? cel.bind(t, c.state.terminated,
        t.?reason.orValue("") != "" ? "Init:" + t.reason
        : t.?signal.orValue(0) != 0 ? "Init:Signal:" + string(t.signal)
        : "Init:ExitCode:" + string(t.?exitCode.orValue(0)))
    : c.?state.?waiting.?reason.orValue("") != "" && c.state.waiting.reason != "PodInitializing" ? "Init:" + c.state.waiting.reason
    : "Init:" + string(bi) + "/" + string(size(initSpecs))),
cel.bind(cs, st.?containerStatuses.orValue([]).map(c,
    cel.bind(w, c.?state.?waiting.?reason.orValue(""),
    cel.bind(t, c.?state.?terminated,
    {
      "set": w != "" || t.hasValue(),
      "reason": w != "" ? w
        : !t.hasValue() ? ""
        : t.value().?reason.orValue("") != "" ? t.value().reason
        : t.value().?signal.orValue(0) != 0 ? "Signal:" + string(t.value().signal)
        : "ExitCode:" + string(t.value().?exitCode.orValue(0)),
      "err": w == "" && t.hasValue() && t.value().?exitCode.orValue(0) != 0,
      "run": w == "" && !t.hasValue() && c.?ready.orValue(false) && c.?state.?running.hasValue(),
      "restarts": c.?restartCount.orValue(0)
    }))),
cel.bind(running, cs.filter(c, c.run),
cel.bind(set, cs.filter(c, c.set),
cel.bind(errs, cs.filter(c, c.err),
cel.bind(r1, !mainRun ? initReason : size(set) > 0 ? set[0].reason : initReason,
cel.bind(r2, !mainRun || r1 != "Completed" ? r1
    : size(running) > 0 && conds.exists(c, c.?type.orValue("") == "Ready" && c.?status.orValue("") == "True") ? "Running"
    : size(errs) > 0 ? errs[0].reason
    : size(running) > 0 ? "NotReady"
    : r1,
cel.bind(deleting, has(self.metadata.deletionTimestamp),
{
  "reason": deleting && st.?reason.orValue("") == "NodeLost" ? "Unknown"
    : deleting && !(phase in ["Succeeded", "Failed"]) ? "Terminating"
    : r2,
  "ready": size(seen.filter(c, c.name in sidecars && c.?started.orValue(false) && c.?ready.orValue(false)
             && !(c.?state.?terminated.hasValue() && c.state.terminated.?exitCode.orValue(0) == 0)))
           + (mainRun ? size(running) : 0),
  "total": size(self.?spec.?containers.orValue([])) + size(sidecars),
  "restarts": mainRun
    ? seen.filter(c, c.name in sidecars).map(c, c.?restartCount.orValue(0)).sum() + cs.map(c, c.restarts).sum()
    : seen.map(c, c.?restartCount.orValue(0)).sum()
}
))))))))))))))))))))
`,
};
