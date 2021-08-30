@tls_scan
Feature: Web application free of TLS vulnerabilities known to the TLS Emissary

# Before hooks are run before Background

Background:
  Given a new TLS Test Session based on the Build User supplied tlsScanner resourceObject

Scenario: The application should not contain vulnerabilities known to the TLS Emissary that exceed the Build User defined threshold
  Given the TLS Emissary is run with arguments
  Then the vulnerability count should not exceed the Build User defined threshold of vulnerabilities known to the TLS Emissary

