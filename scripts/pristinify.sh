#!/bin/sh

if [ $USER != "ec2-user" ]; then
    echo "this script must be run as the ec2-user"
    exit 1
fi

# revert a server back to a pristine state.  This is great to do before
# cutting an image

# stop running scripts under app user
if [ `sudo -u app -i /usr/local/bin/node node_modules/.bin/forever list | grep 'No forever processes' | wc -l` == "0" ]; then
    echo ">> Stopping running servers"
    sudo -u app -i /usr/local/bin/node node_modules/.bin/forever stopall
fi


# remove /tmp crap
sudo rm -rf /tmp/*

# remove and recreate /home/app/var
sudo -u app rm -rf /home/app/{code,code.old,var}
sudo -u app mkdir -p /home/app/var/log 

# reinitialize git
sudo -u app rm -rf /home/app/git
sudo -u app mkdir /home/app/git
GIT_DIR=/home/app/git sudo -u app -E git init --bare
sudo -u app ln -s /home/app/post-update.js /home/app/git/hooks/post-update

# cut ourself off at the knees
truncate -s 0 ~/.ssh/authorized_keys
