#!/bin/bash
# Apply official Raspberry Pi 5 UART overlay (uart0-pi5)

echo "Applying official Raspberry Pi 5 overlay (dtoverlay=uart0-pi5)..."

sudo cp /boot/firmware/config.txt /boot/firmware/config.txt.bak
sudo sed -i '/dtoverlay=uart0/d' /boot/firmware/config.txt
sudo sed -i '/dtoverlay=uart0-pi5/d' /boot/firmware/config.txt
sudo sed -i '/enable_uart=/d' /boot/firmware/config.txt

echo "enable_uart=1" | sudo tee -a /boot/firmware/config.txt
echo "dtoverlay=uart0-pi5" | sudo tee -a /boot/firmware/config.txt

echo "Overlay set to uart0-pi5! Rebooting now to activate hardware..."
sudo reboot
