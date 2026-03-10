package sources

import (
"context"
"testing"
)

func TestGeoJSONHealthCheck(t *testing.T) {
// Test healthy source
source := NewGeoJSONSource()
ctx := context.Background()

health := source.HealthCheck(ctx)

if !health.Healthy {
t.Errorf("Expected healthy source, got unhealthy: %s", health.Message)
}

if health.StatusCode != 200 {
t.Errorf("Expected status code 200, got %d", health.StatusCode)
}

if health.ResponseTime <= 0 {
t.Errorf("Expected positive response time, got %d", health.ResponseTime)
}
}

func TestGeoJSONHealthCheckBadURL(t *testing.T) {
// Test unhealthy source with bad URL
source := &GeoJSONSource{
id:   "test-bad",
name: "Test Bad Source",
url:  "https://raw.githubusercontent.com/nonexistent/repo/master/file.json",
}

ctx := context.Background()
health := source.HealthCheck(ctx)

if health.Healthy {
t.Error("Expected unhealthy source for 404, got healthy")
}

if health.StatusCode == 200 {
t.Error("Expected non-200 status code for bad URL")
}
}
