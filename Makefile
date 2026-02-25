VERSION    ?= 0.1.0
GIT_COMMIT := $(shell git rev-parse HEAD 2>/dev/null || echo "none")
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
PKG        := github.com/anthemworld/cli/cmd
LDFLAGS    := -ldflags "\
	-X $(PKG).version=$(VERSION) \
	-X $(PKG).gitCommit=$(GIT_COMMIT) \
	-X $(PKG).buildDate=$(BUILD_DATE)"

BINARY     := worldanthem
CLI_DIR    := cli/worldanthem
INSTALL_DIR := $(HOME)/bin

.PHONY: build install clean

build:
	go build $(LDFLAGS) -o $(BINARY) ./$(CLI_DIR)

install: build
	@mkdir -p $(INSTALL_DIR)
	cp $(BINARY) $(INSTALL_DIR)/$(BINARY)
	@echo "Installed to $(INSTALL_DIR)/$(BINARY)"

clean:
	rm -f $(BINARY)
