package httpclient

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// --- Retry tests ---

func TestRetry_SucceedsOnFirstAttempt(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	c := New(WithMaxRetries(3), WithBaseDelay(10*time.Millisecond))
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestRetry_RetriesOn429(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n < 3 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(WithMaxRetries(5), WithBaseDelay(10*time.Millisecond))
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if got := attempts.Load(); got != 3 {
		t.Fatalf("expected 3 attempts, got %d", got)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestRetry_RetriesOn503(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n < 2 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(WithMaxRetries(3), WithBaseDelay(10*time.Millisecond))
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if got := attempts.Load(); got != 2 {
		t.Fatalf("expected 2 attempts, got %d", got)
	}
}

func TestRetry_GivesUpAfterMaxRetries(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := New(WithMaxRetries(3), WithBaseDelay(10*time.Millisecond))
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	// 1 initial + 3 retries = 4
	if got := attempts.Load(); got != 4 {
		t.Fatalf("expected 4 attempts (1 + 3 retries), got %d", got)
	}
	if resp.StatusCode != 429 {
		t.Fatalf("expected final 429, got %d", resp.StatusCode)
	}
}

func TestRetry_DoesNotRetryOn4xx(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := New(WithMaxRetries(3), WithBaseDelay(10*time.Millisecond))
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()

	if got := attempts.Load(); got != 1 {
		t.Fatalf("expected 1 attempt (no retry on 404), got %d", got)
	}
}

func TestRetry_RespectsContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	c := New(WithMaxRetries(5), WithBaseDelay(10*time.Millisecond))
	_, err := c.Get(ctx, srv.URL)
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}

// --- Rate limiter tests ---

func TestRateLimiter_ThrottlesRequests(t *testing.T) {
	var count atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// 10 requests per second limit
	c := New(WithRateLimit(10, 1))

	start := time.Now()
	for i := 0; i < 5; i++ {
		resp, err := c.Get(context.Background(), srv.URL)
		if err != nil {
			t.Fatalf("request %d: %v", i, err)
		}
		resp.Body.Close()
	}
	elapsed := time.Since(start)

	if count.Load() != 5 {
		t.Fatalf("expected 5 requests, got %d", count.Load())
	}
	// 5 requests at 10/s should take at least ~400ms (burst=1, so tokens arrive at 100ms intervals)
	if elapsed < 350*time.Millisecond {
		t.Fatalf("rate limiting too fast: %v (expected >= 350ms)", elapsed)
	}
}

// --- Context cancellation helper tests ---

func TestCheckContext_ReturnsNilWhenNotCancelled(t *testing.T) {
	err := CheckContext(context.Background())
	if err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestCheckContext_ReturnsErrorWhenCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := CheckContext(ctx)
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}

// --- UserAgent tests ---

func TestUserAgent_SentOnRequests(t *testing.T) {
	var gotUA string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(WithUserAgent("TestAgent/1.0"))
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	resp.Body.Close()

	if gotUA != "TestAgent/1.0" {
		t.Fatalf("expected User-Agent 'TestAgent/1.0', got %q", gotUA)
	}
}

// --- Do method tests ---

func TestDo_SendsCustomHeaders(t *testing.T) {
	var gotAccept string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAccept = r.Header.Get("Accept")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New()
	req, _ := http.NewRequestWithContext(context.Background(), "GET", srv.URL, nil)
	req.Header.Set("Accept", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	resp.Body.Close()

	if gotAccept != "application/json" {
		t.Fatalf("expected Accept 'application/json', got %q", gotAccept)
	}
}

func TestHead_Works(t *testing.T) {
	var gotMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New()
	resp, err := c.Head(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	resp.Body.Close()

	if gotMethod != "HEAD" {
		t.Fatalf("expected HEAD, got %s", gotMethod)
	}
}

// --- Retry-After header tests ---

func TestRetry_RespectsRetryAfterHeader(t *testing.T) {
	var attempts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n < 2 {
			w.Header().Set("Retry-After", "1") // 1 second
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(WithMaxRetries(3), WithBaseDelay(10*time.Millisecond))
	start := time.Now()
	resp, err := c.Get(context.Background(), srv.URL)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	// Should have waited ~1s for Retry-After
	if elapsed < 900*time.Millisecond {
		t.Fatalf("expected >= 900ms wait for Retry-After, got %v", elapsed)
	}
}

func TestNew_DefaultUserAgent(t *testing.T) {
	var gotUA string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New()
	resp, err := c.Get(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	if gotUA != fmt.Sprintf("AnthemWorld-CLI/%s", DefaultUserAgentVersion) {
		t.Fatalf("expected default UA, got %q", gotUA)
	}
}
