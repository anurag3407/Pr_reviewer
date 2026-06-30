#!/bin/bash
set -e

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

echo ""
echo "=== Installing Git ==="
sudo apt install -y git

echo ""
echo "=== Creating 2GB Swap File (critical for 1GB RAM) ==="
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

echo ""
echo "=== Verifying ==="
docker --version
git --version
echo "Memory:"
free -h

echo ""
echo "============================================"
echo "✅ Server setup complete!"
echo "  Docker installed"
echo "  Git installed"
echo "  2GB Swap active"
echo "============================================"
echo ""
echo "⚠️  Log out and SSH back in for docker group to take effect:"
echo "  exit"
echo "  ssh -i ~/autoheal-key.pem ubuntu@3.111.166.2"
