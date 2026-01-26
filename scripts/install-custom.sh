#!/usr/bin/env bash
# OpenChamber Custom Fork Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/pawelhajduk/opencode-web/release/scripts/install-custom.sh | bash

set -e

# Constants
REPO_OWNER="pawelhajduk"
REPO_NAME="opencode-web"
MIN_NODE_VERSION=20
TEMP_DIR="/tmp"
TARBALL_NAME="openchamber.tgz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
  echo -e "${BLUE}info${NC}  $1"
}

success() {
  echo -e "${GREEN}success${NC}  $1"
}

warn() {
  echo -e "${YELLOW}warn${NC}  $1"
}

error() {
  echo -e "${RED}error${NC}  $1"
}

# Check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Get Node.js major version
get_node_version() {
  if command_exists node; then
    node -v | sed 's/v//' | cut -d. -f1
  else
    echo "0"
  fi
}

# Detect preferred package manager
detect_package_manager() {
  # Check if running inside an npm/pnpm/yarn/bun context
  if [ -n "$npm_config_user_agent" ]; then
    case "$npm_config_user_agent" in
      bun*) echo "bun"; return ;;
      pnpm*) echo "pnpm"; return ;;
      yarn*) echo "yarn"; return ;;
      npm*) echo "npm"; return ;;
    esac
  fi

  # Check for lockfiles in current directory (user preference)
  if [ -f "bun.lockb" ]; then
    echo "bun"; return
  elif [ -f "pnpm-lock.yaml" ]; then
    echo "pnpm"; return
  elif [ -f "yarn.lock" ]; then
    echo "yarn"; return
  elif [ -f "package-lock.json" ]; then
    echo "npm"; return
  fi

  # Check which package managers are available (prefer pnpm > bun > yarn > npm)
  if command_exists bun; then
    echo "bun"
  elif command_exists pnmp; then
    echo "pnmp"
  elif command_exists yarn; then
    echo "yarn"
  elif command_exists npm; then
    echo "npm"
  else
    echo "none"
  fi
}

# Get install command for package manager
get_install_command() {
  local pm=$1
  local target=$2
  case "$pm" in
    bun) echo "bun add -g $target" ;;
    pnpm) echo "pnpm add -g $target" ;;
    yarn) echo "yarn global add $target" ;;
    npm) echo "npm install -g $target" ;;
    *) echo "" ;;
  esac
}

# Suggest Node.js installation
suggest_node_install() {
  echo ""
  error "Node.js $MIN_NODE_VERSION+ is required but not found."
  echo ""
  echo "Install Node.js using one of these methods:"
  echo ""
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  Using Homebrew:"
    echo "    brew install node"
    echo ""
  fi
  
  echo "  Using nvm (recommended):"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "    nvm install $MIN_NODE_VERSION"
  echo ""
  echo "  Using fnm:"
  echo "    curl -fsSL https://fnm.vercel.app/install | bash"
  echo "    fnm install $MIN_NODE_VERSION"
  echo ""
  echo "  Official installer:"
  echo "    https://nodejs.org/"
  echo ""
  exit 1
}

# Install package manager suggestion
suggest_pm_install() {
  echo ""
  error "No package manager found (npm, pnpm, yarn, or bun)."
  echo ""
  echo "Install a package manager:"
  echo ""
  echo "  npm (comes with Node.js):"
  echo "    Install Node.js from https://nodejs.org/"
  echo ""
  echo "  pnpm (recommended):"
  echo "    curl -fsSL https://get.pnpm.io/install.sh | sh -"
  echo ""
  echo "  bun:"
  echo "    curl -fsSL https://bun.sh/install | bash"
  echo ""
  echo "  yarn:"
  echo "    npm install -g yarn"
  echo ""
  exit 1
}

# Fetch latest release from GitHub API
fetch_latest_release() {
  local api_url="https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest"
  
  if ! command_exists curl; then
    error "curl is required but not found"
    exit 1
  fi
  
  curl -fsSL "$api_url"
}

# Extract tarball URL from GitHub API response
extract_tarball_url() {
  local json_response="$1"
  
  if command_exists jq; then
    echo "$json_response" | jq -r '.assets[0].browser_download_url'
  else
    # Fallback: extract first browser_download_url from assets
    echo "$json_response" | grep -o '"browser_download_url": *"[^"]*"' | head -1 | sed 's/.*"\(http[^"]*\)".*/\1/'
  fi
}

# Extract version from GitHub API response
extract_version() {
  local json_response="$1"
  
  if ! command_exists jq; then
    # Fallback: use grep and sed if jq is not available
    echo "$json_response" | grep -o '"tag_name":"[^"]*"' | head -1 | sed 's/"tag_name":"\(.*\)"/\1/'
  else
    echo "$json_response" | jq -r '.tag_name'
  fi
}

# Main installation function
main() {
  echo ""
  echo "  ╭───────────────────────────────────╮"
  echo "  │                                   │"
  echo "  │   OpenChamber Custom Install      │"
  echo "  │   Fork: $REPO_OWNER/$REPO_NAME"
  echo "  │                                   │"
  echo "  ╰───────────────────────────────────╯"
  echo ""


  # Detect package manager
  info "Detecting package manager..."
  PM=$(detect_package_manager)
  
  if [ "$PM" = "none" ]; then
    suggest_pm_install
  fi
  success "Using $PM"

  # Fetch latest release
  info "Fetching latest release from GitHub..."
  RELEASE_JSON=$(fetch_latest_release)
  
  if [ -z "$RELEASE_JSON" ]; then
    error "Failed to fetch release information"
    exit 1
  fi

  # Extract version and tarball URL
  VERSION=$(extract_version "$RELEASE_JSON")
  TARBALL_URL=$(extract_tarball_url "$RELEASE_JSON")
  
  if [ -z "$TARBALL_URL" ]; then
    error "Could not find tarball in release assets"
    exit 1
  fi
  
  success "Found version $VERSION"

  # Download tarball
  TARBALL_PATH="$TEMP_DIR/$TARBALL_NAME"
  info "Downloading tarball..."
  
  if ! curl -fsSL -o "$TARBALL_PATH" "$TARBALL_URL"; then
    error "Failed to download tarball from $TARBALL_URL"
    exit 1
  fi
  
  success "Tarball downloaded"

  # Get install command
  INSTALL_CMD=$(get_install_command "$PM" "$TARBALL_PATH")
  
  if [ -z "$INSTALL_CMD" ]; then
    error "Could not determine install command"
    exit 1
  fi

  # Install globally
  echo ""
  info "Installing OpenChamber globally..."
  echo "  Running: $INSTALL_CMD"
  echo ""
  
  if eval "$INSTALL_CMD"; then
    # Cleanup
    rm -f "$TARBALL_PATH"
    
    echo ""
    success "OpenChamber installed successfully!"
    echo ""
    echo "  Get started:"
    echo "    openchamber              # Start server on port 3000"
    echo "    openchamber --help       # Show all options"
    echo ""
    echo "  Prerequisites:"
    echo "    Make sure OpenCode is running: opencode serve"
    echo ""
  else
    # Cleanup on failure
    rm -f "$TARBALL_PATH"
    
    echo ""
    error "Installation failed"
    echo ""
    echo "  Try running manually:"
    echo "    $INSTALL_CMD"
    echo ""
    echo "  If you get permission errors, see:"
    echo "    https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
    echo ""
    exit 1
  fi
}

main "$@"
