# Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

# Use of this software is governed by the Business Source License
# included in the file /licenses/bsl.md

# As of the Change Date specified in that file, in accordance with
# the Business Source License, use of this software will be governed
# by the Apache License, Version 2.0

FROM node:17-alpine

ARG LOCAL_USER_ID
ARG LOCAL_GROUP_ID

# Create an environment variable in our image for the non-root user we want to use.
# ENV USER 1000
ENV USER=tls_scanner GROUP=purpleteam TESTSSL_VERSION=v3.0.6
RUN echo user is: ${USER}, LOCAL_USER_ID is: ${LOCAL_USER_ID}, group is: ${GROUP}, LOCAL_GROUP_ID is: ${LOCAL_GROUP_ID}

# Following taken from: https://github.com/mhart/alpine-node/issues/48#issuecomment-430902787
RUN apk add --no-cache shadow && \
    apk add --no-cache bash procps drill coreutils libidn curl socat openssl xxd && \
    if [ -z "`getent group $LOCAL_GROUP_ID`" ]; then \
      addgroup -S -g $LOCAL_GROUP_ID $GROUP; \
    else \
      groupmod -n $GROUP `getent group $LOCAL_GROUP_ID | cut -d: -f1`; \
    fi && \
    if [ -z "`getent passwd $LOCAL_USER_ID`" ]; then \
      adduser -S -u $LOCAL_USER_ID -G $GROUP -s /bin/sh $USER; \
    else \
      usermod -l $USER -g $LOCAL_GROUP_ID -d /home/$USER -m `getent passwd $LOCAL_USER_ID | cut -d: -f1`; \
    fi

# Useful for running commands as root in development
# RUN apk add --no-cache sudo && \
#     echo "$USER ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/$USER && \
#     chmod 0440 /etc/sudoers.d/$USER

ENV WORKDIR /usr/src/app/

# Home is required for npm install. System account with no ability to login to shell
# For standard node image:
#RUN useradd --create-home --system --shell /bin/false $USER
# For node alpine:
# RUN addgroup -S $USER && adduser -S $USER -G $GROUP

RUN mkdir -p $WORKDIR && chown $USER:$GROUP --recursive $WORKDIR

WORKDIR $WORKDIR

RUN curl -sSL https://github.com/drwetter/testssl.sh/archive/refs/tags/${TESTSSL_VERSION}.tar.gz > testssl.sh-${TESTSSL_VERSION}.tar.gz && \
    mkdir --mode=750 --parents ${WORKDIR}unpack-testssl/ ${WORKDIR}testssl/ ${WORKDIR}testssl/etc/ ${WORKDIR}testssl/bin/ && \
    tar --extract --file=testssl.sh-${TESTSSL_VERSION}.tar.gz --directory=${WORKDIR}unpack-testssl/ --strip 1 && \
    cp -r ${WORKDIR}unpack-testssl/etc/. ${WORKDIR}testssl/etc/ && \
    cp -r ${WORKDIR}unpack-testssl/bin/. ${WORKDIR}testssl/bin/ && \
    cp ${WORKDIR}unpack-testssl/testssl.sh ${WORKDIR}testssl/ && \
    chown $USER:$GROUP --recursive ${WORKDIR}testssl/ && \
    rm -rf ${WORKDIR}unpack-testssl/ && \
    rm testssl.sh-${TESTSSL_VERSION}.tar.gz    
    # ln -s ${WORKDIR}testssl/ /usr/local/bin/testssl/

ENV PATH="/usr/src/app/testssl:${PATH}"

RUN chown $USER:$GROUP --recursive /usr/src/app/

# For npm@5 or later, copy the automatically generated package-lock.json instead.
COPY package*.json /usr/src/app/

RUN npm install

# String expansion doesn't work currently: https://github.com/moby/moby/issues/35018
# COPY --chown=${USER}:GROUP . $WORKDIR
COPY --chown=tls_scanner:purpleteam . /usr/src/app/

# Here I used to chown and chmod as shown here: http://f1.holisticinfosecforwebdevelopers.com/chap03.html#vps-countermeasures-docker-the-default-user-is-root
# Problem is, each of these commands creates another layer of all the files modified and thus adds over 100MB to the image: https://www.datawire.io/not-engineer-running-3-5gb-docker-images/
# In a prod environment, it may? make sense to do the following, similar to the similar commented out line in the NodeGoat Dockerfile.
#RUN chmod -R g-s,o-rx /home/$USER && chmod -R o-wrx $WORKDIR

# Then all further actions including running the containers should
# be done under non-root user, unless root is actually required.
USER $USER

EXPOSE 3020

CMD ["npm", "start"]
