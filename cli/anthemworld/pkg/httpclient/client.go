// Package httpclient provides a shared HTTP client with retry, rate limiting,
// and context cancellation support for data source downloads.
package httpclient

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"

	"golang.org/x/time/rate"
)

const DefaultUserAgentVersion = "1.0"

// Client wraps http.Client with retry, rate limiting, and default headers.
type Client struct {
	http      *http.Client
	limiter   *rate.Limiter
	userAgent string
	maxRetry  int
	baseDelay time.Duration
}

// Option configures a Client.
type Option func(*Client)

// WithTimeout sets the HTTP request timeout.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.http.Timeout = d }
}

// WithMaxRetries sets the maximum number of retries (0 = no retries).
func WithMaxRetries(n int) Option {
	return func(c *Client) { c.maxRetry = n }
}

// WithBaseDelay sets the base delay for exponential backoff.
func WithBaseDelay(d time.Duration) Option {
	return func(c *Client) { c.baseDelay = d }
}

// WithRateLimit sets a token-bucket rate limiter (requests per second, burst size).
func WithRateLimit(rps float64, burst int) Option {
	return func(c *Client) { c.limiter = rate.NewLimiter(rate.Limit(rps), burst) }
}

// WithUserAgent sets the User-Agent header.
func WithUserAgent(ua string) Option {
	return func(c *Client) { c.userAgent = ua }
}

// New creates a Client with the given options.
func New(opts ...Option) *Client {
	c := &Client{
		http:      &http.Client{Timeout: 30 * time.Second},
		userAgent: fmt.Sprintf("AnthemWorld-CLI/%s", DefaultUserAgentVersion),
		maxRetry:  2,
		baseDelay: 1 * time.Second,
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// retryable returns true for status codes that should trigger a retry.
func retryable(code int) bool {
	return code == http.StatusTooManyRequests ||
		code == http.StatusServiceUnavailable ||
		code == http.StatusBadGateway ||
		code == http.StatusGatewayTimeout
}

// Do executes a request with retry, rate limiting, and default headers.
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", c.userAgent)
	}

	var resp *http.Response
	var err error

	for attempt := 0; attempt <= c.maxRetry; attempt++ {
		if err := CheckContext(req.Context()); err != nil {
			return nil, err
		}

		// Wait for rate limiter
		if c.limiter != nil {
			if err := c.limiter.Wait(req.Context()); err != nil {
				return nil, fmt.Errorf("rate limiter: %w", err)
			}
		}

		// Close previous response body if retrying
		if resp != nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}

		resp, err = c.http.Do(req)
		if err != nil {
			// Network-level error on last attempt → return it
			if attempt == c.maxRetry {
				return nil, err
			}
			c.sleep(req.Context(), c.backoff(attempt, nil))
			continue
		}

		if !retryable(resp.StatusCode) || attempt == c.maxRetry {
			return resp, nil
		}

		delay := c.backoff(attempt, resp)
		c.sleep(req.Context(), delay)
	}

	// Should not reach here, but just in case
	if resp != nil {
		return resp, nil
	}
	return nil, err
}

// backoff calculates the delay for a given attempt, respecting Retry-After.
func (c *Client) backoff(attempt int, resp *http.Response) time.Duration {
	// Check Retry-After header
	if resp != nil {
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if secs, err := strconv.Atoi(ra); err == nil && secs > 0 {
				return time.Duration(secs) * time.Second
			}
		}
	}
	// Exponential backoff: baseDelay * 2^attempt
	return time.Duration(float64(c.baseDelay) * math.Pow(2, float64(attempt)))
}

// sleep waits for d or until ctx is cancelled.
func (c *Client) sleep(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
	case <-ctx.Done():
	}
}

// Get performs a GET request.
func (c *Client) Get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	return c.Do(req)
}

// Head performs a HEAD request.
func (c *Client) Head(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "HEAD", url, nil)
	if err != nil {
		return nil, err
	}
	return c.Do(req)
}

// CheckContext returns an error if the context is done. Use between loop
// iterations to support graceful cancellation.
func CheckContext(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return nil
	}
}
