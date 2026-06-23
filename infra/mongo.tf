# ---------------------------------------------------------------------------
# Dedicated MongoDB for GWJ — a NEW box, fully separate from Oxy's Mongo. The
# EBS data volume survives instance replacement. Reachable on 27017 ONLY from
# the GWJ tasks SG (network.tf). Lean: NO S3 backup timer in the userdata (the
# mongo IAM role already grants backup writes if one is added later).
# ---------------------------------------------------------------------------

# Dedicated data volume (DB lives here; same AZ as the instance subnet).
resource "aws_ebs_volume" "mongo_data" {
  availability_zone = data.aws_subnet.oxy_public_a.availability_zone
  size              = 30
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${var.prefix}-mongo-data" }
}

resource "aws_instance" "mongo" {
  ami                    = data.aws_ssm_parameter.al2023_arm.value
  instance_type          = "t4g.small"
  subnet_id              = data.aws_subnet.oxy_public_a.id
  vpc_security_group_ids = [aws_security_group.mongo.id]
  iam_instance_profile   = aws_iam_instance_profile.mongo.name

  user_data = templatefile("${path.module}/files/mongo-userdata.sh", {
    region = var.region
    db     = "gwj"
  })

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.prefix}-mongo"
    Role = "mongo"
  }

  # The AMI comes from the "latest AL2023" SSM param, which AWS bumps over time.
  # Ignore AMI drift so a routine apply never replaces this box (and cascade-
  # replaces its data-volume attachment). Re-image deliberately only.
  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_volume_attachment" "mongo_data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.mongo_data.id
  instance_id = aws_instance.mongo.id
}
