{{/* Its name: the release's, or the release's and the chart's (a release not called overkube). */}}
{{- define "overkube.name" -}}
{{- if contains .Chart.Name .Release.Name -}}{{ .Release.Name | trunc 63 | trimSuffix "-" }}{{- else -}}{{ printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}{{- end -}}
{{- end -}}

{{- define "overkube.selector" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "overkube.labels" -}}
{{ include "overkube.selector" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* The names it is reached by: hosts, and the Ingress's. */}}
{{- define "overkube.hosts" -}}
{{- $hosts := .Values.hosts -}}
{{- if .Values.ingress.enabled -}}{{- $hosts = concat $hosts .Values.ingress.hosts -}}{{- end -}}
{{- $hosts | uniq | join "," -}}
{{- end -}}
