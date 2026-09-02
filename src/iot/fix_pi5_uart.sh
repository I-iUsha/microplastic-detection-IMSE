#!/bin/bash
# Script to free GPIO 14/15 UART from Bluetooth on Raspberry Pi 5

echo "Fixing Raspberry Pi 5 UART for GPS..."

# 1. Backup config.txt
sudo cp /boot/firmware/config.txt /boot/firmware/config.txt.bak

# 2. Ensure disable-bt and uart0 are in config.txt
sudo sed -i '/dtoverlay=disable-bt/d' /boot/firmware/config.txt
sudo sed -i '/dtoverlay=uart0/d' /boot/firmware/config.txt
sudo sed -i '/enable_uart=/d' /boot/firmware/config.txt

echo "enable_uart=1" | sudo tee -a /boot/firmware/config.txt
echo "dtoverlay=disable-bt" | sudo tee -a /boot/firmware/config.txt
echo "dtoverlay=uart0" | sudo tee -a /boot/firmware/config.txt

# 3. Disable hciuart service
sudo systemctl disable hciuart 2>/dev/null
sudo systemctl stop hciuart 2>/dev/null

echo "Done! Rebooting Raspberry Pi 5 now to apply hardware changes..."
sudo reboot
