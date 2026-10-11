import { describe, expect, it } from 'vitest';
import { classify } from './paths.ts';

describe('classify', () => {
  it('tells collections, objects and subresources apart, in a namespace or not', () => {
    expect(classify('/api/v1/pods')).toEqual({ type: 'collection', plural: 'pods' });
    expect(classify('/api/v1/namespaces/media/pods')).toEqual({ type: 'collection', plural: 'pods', namespace: 'media' });
    expect(classify('/apis/apps/v1/deployments')).toEqual({ type: 'collection', plural: 'deployments' });
    expect(classify('/apis/apps/v1/namespaces/media/deployments/web')).toEqual({ type: 'object', plural: 'deployments', name: 'web', namespace: 'media' });
    expect(classify('/apis/apps/v1/namespaces/media/deployments/web/scale')).toEqual({
      type: 'subresource',
      plural: 'deployments',
      name: 'web',
      subresource: 'scale',
      namespace: 'media',
    });
    expect(classify('/api/v1/nodes/kube')).toEqual({ type: 'object', plural: 'nodes', name: 'kube' });
    expect(classify('/api/v1/namespaces/media/pods/web-1/log')).toMatchObject({ type: 'subresource', subresource: 'log' });
  });

  it('sees namespaces themselves as a kind', () => {
    expect(classify('/api/v1/namespaces')).toEqual({ type: 'collection', plural: 'namespaces' });
    expect(classify('/api/v1/namespaces/media')).toEqual({ type: 'object', plural: 'namespaces', name: 'media' });
    expect(classify('/api/v1/namespaces/media/status')).toEqual({ type: 'subresource', plural: 'namespaces', name: 'media', subresource: 'status' });
    expect(classify('/api/v1/namespaces/media/finalize')).toMatchObject({ type: 'subresource', subresource: 'finalize' });
  });

  it('sees discovery and schemas as other', () => {
    for (const p of ['/api', '/api/v1', '/apis', '/apis/apps', '/apis/apps/v1', '/version', '/openapi/v3', '/openapi/v3/apis/apps/v1']) {
      expect(classify(p), p).toEqual({ type: 'other' });
    }
  });

  it('refuses what reaches past the API server, and what is not its path', () => {
    for (const p of [
      '/api/v1/nodes/kube/proxy/healthz',
      '/api/v1/namespaces/media/pods/web-1/proxy',
      '/api/v1/namespaces/media/services/web:80/proxy/admin',
      '/api/v1/namespaces/media/pods/web-1/exec',
      '/api/v1/namespaces/media/pods/web-1/attach',
      '/api/v1/namespaces/media/pods/web-1/portforward',
      '/api/v1/proxy/nodes/kube',
      '/healthz',
      '/version/x',
      '/openapi/v2',
      '/api/../healthz',
      '/api/%2e%2e/healthz',
      '/apis/..%2F..%2Fhealthz',
      '/api/v1/pods%2Fx',
      '/api/v1/nodes/kube/%70roxy/healthz',
      '/api/v1/namespaces/media/pods/web-1/%65xec',
      '/api/v1/namespaces/media/pods/web-1/%45xec',
      '/api/v1/%70roxy/nodes/kube',
      '/api/v1/namespaces/media/pods/web%2D1',
      '/',
      '',
    ]) {
      expect(classify(p), p).toBeNull();
    }
  });

  it('passes on no "." segment', () => {
    expect(classify('/api/v1/namespaces/a/pods/b/./exec')).toBeNull();
    expect(classify('/api/v1/./pods')).toBeNull();
  });
});
