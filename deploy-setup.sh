#!/bin/bash
set -e

REGION="ap-south-1"

echo "=== Step 1: Creating Security Group ==="
SG_ID=$(aws ec2 create-security-group \
  --group-name autoheal-sg \
  --description "Autoheal PR Reviewer" \
  --region $REGION \
  --query 'GroupId' --output text)
echo "Security Group: $SG_ID"

echo "Opening ports 22, 80, 443, 3000..."
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0 --region $REGION > /dev/null
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $REGION > /dev/null
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $REGION > /dev/null
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $REGION > /dev/null
echo "✅ Ports opened"

echo ""
echo "=== Step 2: Creating Key Pair ==="
aws ec2 create-key-pair \
  --key-name autoheal-key \
  --query 'KeyMaterial' \
  --output text \
  --region $REGION > ~/autoheal-key.pem
chmod 400 ~/autoheal-key.pem
echo "✅ Key pair saved to ~/autoheal-key.pem"

echo ""
echo "=== Step 3: Finding Ubuntu 24.04 AMI ==="
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" \
            "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text \
  --region $REGION)
echo "AMI: $AMI_ID"

echo ""
echo "=== Step 4: Launching t2.micro Instance ==="
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t2.micro \
  --key-name autoheal-key \
  --security-group-ids $SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
  --region $REGION \
  --query 'Instances[0].InstanceId' --output text)
echo "Instance: $INSTANCE_ID"

echo "Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $REGION
echo "✅ Instance is running"

echo ""
echo "=== Step 5: Allocating Elastic IP ==="
ALLOC_ID=$(aws ec2 allocate-address \
  --domain vpc \
  --region $REGION \
  --query 'AllocationId' --output text)

aws ec2 associate-address \
  --instance-id $INSTANCE_ID \
  --allocation-id $ALLOC_ID \
  --region $REGION > /dev/null

PUBLIC_IP=$(aws ec2 describe-addresses \
  --allocation-ids $ALLOC_ID \
  --region $REGION \
  --query 'Addresses[0].PublicIp' --output text)

echo ""
echo "============================================"
echo "✅ ALL DONE! Your server is ready!"
echo "============================================"
echo "Instance ID:  $INSTANCE_ID"
echo "Public IP:    $PUBLIC_IP"
echo "Security Grp: $SG_ID"
echo "Key file:     ~/autoheal-key.pem"
echo ""
echo "SSH in with:"
echo "  ssh -i ~/autoheal-key.pem ubuntu@$PUBLIC_IP"
echo "============================================"
